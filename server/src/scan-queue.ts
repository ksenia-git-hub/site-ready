import { randomUUID } from 'node:crypto';
import type { ScanJobView, ScreenshotDevice } from '@qa/shared';
import { ScanCancelledError, ScanError, type PageScreenshots, type ScanOptions, type Scanner } from './scan/types.ts';

const DEFAULT_MAX_STORED_JOBS = 50;
/** Screenshots take far more memory than reports (~100 KB per page): keep them for fewer jobs. */
const DEFAULT_MAX_JOBS_WITH_SCREENSHOTS = 10;

/**
 * In-memory job list that runs one scan at a time (a browser is memory-hungry).
 * Jobs are lost on restart, which is acceptable for now: reports are not meant to be stored.
 */
export class ScanQueue {
  readonly #scanner: Scanner;
  readonly #maxStoredJobs: number;
  readonly #maxJobsWithScreenshots: number;
  readonly #jobs = new Map<string, ScanJobView>();
  /** Insertion-ordered, oldest first, so pruning drops the oldest screenshots. */
  readonly #screenshots = new Map<string, PageScreenshots[]>();
  readonly #pending: { job: ScanJobView; options: ScanOptions }[] = [];
  /** Who started each job (an IP address), to limit how many scans one visitor can run at once. */
  readonly #owners = new Map<string, string>();
  /** Stops the scan that is running now. */
  #runningController: { id: string; controller: AbortController } | null = null;
  #running = false;

  constructor(
    scanner: Scanner,
    maxStoredJobs = DEFAULT_MAX_STORED_JOBS,
    maxJobsWithScreenshots = DEFAULT_MAX_JOBS_WITH_SCREENSHOTS,
  ) {
    this.#scanner = scanner;
    this.#maxStoredJobs = maxStoredJobs;
    this.#maxJobsWithScreenshots = maxJobsWithScreenshots;
  }

  /** Queued and running scans, of one owner or of everybody. */
  activeCount(owner?: string): number {
    let count = 0;
    for (const job of this.#jobs.values()) {
      if ((job.status === 'queued' || job.status === 'running') && (owner === undefined || this.#owners.get(job.id) === owner)) count++;
    }
    return count;
  }

  enqueue(url: string, options: ScanOptions, owner?: string): ScanJobView {
    const job: ScanJobView = {
      id: randomUUID(),
      status: 'queued',
      url,
      createdAt: new Date().toISOString(),
      progress: { step: 'queued' },
      report: null,
      error: null,
    };
    this.#jobs.set(job.id, job);
    if (owner) this.#owners.set(job.id, owner);
    this.#pending.push({ job, options });
    this.#prune();
    void this.#drain();
    return job;
  }

  get(id: string): ScanJobView | null {
    return this.#jobs.get(id) ?? null;
  }

  /**
   * Stops a scan: a queued one is simply dropped, a running one is aborted (the scanner closes its
   * browser). Returns the job, or null if unknown, or "notCancellable" if it had already finished.
   */
  cancel(id: string): ScanJobView | 'notCancellable' | null {
    const job = this.#jobs.get(id);
    if (!job) return null;
    if (job.status !== 'queued' && job.status !== 'running') return job.status === 'cancelled' ? job : 'notCancellable';

    const queuedIndex = this.#pending.findIndex((entry) => entry.job.id === id);
    if (queuedIndex !== -1) this.#pending.splice(queuedIndex, 1);
    if (this.#runningController?.id === id) this.#runningController.controller.abort();
    job.status = 'cancelled';
    job.progress = null;
    return job;
  }

  /** JPEG of one analyzed page, or null if it doesn't exist (anymore). */
  getScreenshot(id: string, pageIndex: number, device: ScreenshotDevice): Buffer | null {
    return this.#screenshots.get(id)?.[pageIndex]?.[device] ?? null;
  }

  async #drain(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      for (let next = this.#pending.shift(); next; next = this.#pending.shift()) {
        const { job, options } = next;
        job.status = 'running';
        const controller = new AbortController();
        this.#runningController = { id: job.id, controller };
        try {
          const result = await this.#scanner(job.url, { ...options, signal: controller.signal }, (progress) => {
            if (!controller.signal.aborted) job.progress = progress;
          });
          if (controller.signal.aborted) continue;
          job.report = result.report;
          this.#storeScreenshots(job.id, result.screenshots);
          job.status = 'done';
        } catch (error) {
          // Stopped by the user: cancel() already set the status, it's not a failure.
          if (controller.signal.aborted || error instanceof ScanCancelledError) {
            job.status = 'cancelled';
            continue;
          }
          job.status = 'failed';
          job.error =
            error instanceof ScanError
              ? { url: error.url, ...error.failure }
              : { url: null, reason: 'other', message: error instanceof Error ? error.message : String(error) };
        } finally {
          job.progress = null;
          this.#runningController = null;
        }
      }
    } finally {
      this.#running = false;
    }
  }

  #storeScreenshots(id: string, screenshots: PageScreenshots[]): void {
    this.#screenshots.set(id, screenshots);
    for (const oldId of this.#screenshots.keys()) {
      if (this.#screenshots.size <= this.#maxJobsWithScreenshots) break;
      this.#screenshots.delete(oldId);
      // The report says screenshots exist: correct it so the client doesn't request missing images.
      for (const page of this.#jobs.get(oldId)?.report?.pages ?? []) page.screenshots = false;
    }
  }

  /** Drops the oldest finished jobs so memory doesn't grow forever. */
  #prune(): void {
    for (const [id, job] of this.#jobs) {
      if (this.#jobs.size <= this.#maxStoredJobs) break;
      if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
        this.#jobs.delete(id);
        this.#screenshots.delete(id);
        this.#owners.delete(id);
      }
    }
  }
}
