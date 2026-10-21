import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScanJobView } from '@qa/shared';
import { buildApp, parseTargetUrl } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { buildReport } from '../src/scan/report.ts';
import { ScanCancelledError, ScanError, type ScanResult, type Scanner } from '../src/scan/types.ts';

describe('GET /api/health', () => {
  const app = buildApp();
  afterEach(() => app.close());

  it('responds with status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('scans API', () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const emptyResult = (url: string): ScanResult => ({
    report: buildReport({
      startUrl: url,
      pages: [{ url, title: null, screenshots: true, metrics: null }],
      drafts: [],
      warnings: [],
      linksChecked: 0,
      imagesChecked: 0,
      durationMs: 1,
    }),
    screenshots: [{ desktop: JPEG, mobile: null }],
  });

  async function waitForJob(app: ReturnType<typeof buildApp>, id: string): Promise<ScanJobView> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const job = (await app.inject({ method: 'GET', url: `/api/scans/${id}` })).json() as ScanJobView;
      if (job.status === 'done' || job.status === 'failed') return job;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Job did not finish');
  }

  it('runs a scan and returns the report', async () => {
    const calls: { url: string; maxPages: number }[] = [];
    const scanner: Scanner = async (url, options, onProgress) => {
      calls.push({ url, maxPages: options.maxPages });
      onProgress({ step: 'starting' });
      return emptyResult(url);
    };
    const app = buildApp({ scanner });

    const created = await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com', maxPages: 3 } });
    expect(created.statusCode).toBe(202);

    const job = await waitForJob(app, created.json().id);
    expect(job.status).toBe('done');
    expect(job.report?.startUrl).toBe('https://example.com/');
    expect(calls).toEqual([{ url: 'https://example.com/', maxPages: 3 }]);
    await app.close();
  });

  it('serves the screenshots of a finished scan', async () => {
    const app = buildApp({ scanner: async (url) => emptyResult(url) });
    const { id } = (await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com' } })).json();
    await waitForJob(app, id);

    const desktop = await app.inject({ method: 'GET', url: `/api/scans/${id}/screenshots/0/desktop` });
    const mobile = await app.inject({ method: 'GET', url: `/api/scans/${id}/screenshots/0/mobile` });
    const badDevice = await app.inject({ method: 'GET', url: `/api/scans/${id}/screenshots/0/tablet` });

    expect(desktop.statusCode).toBe(200);
    expect(desktop.headers['content-type']).toBe('image/jpeg');
    expect(desktop.rawPayload).toEqual(JPEG);
    expect(mobile.statusCode).toBe(404);
    expect(badDevice.statusCode).toBe(404);
    await app.close();
  });

  it('reports why the start page could not be opened', async () => {
    const app = buildApp({
      scanner: async (url) => {
        throw new ScanError(url, { reason: 'http', status: 503 });
      },
    });

    const created = await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'https://example.com' } });
    const job = await waitForJob(app, created.json().id);

    expect(job.status).toBe('failed');
    expect(job.error).toEqual({ url: 'https://example.com/', reason: 'http', status: 503 });
    await app.close();
  });

  it('reports unexpected errors with their message', async () => {
    const app = buildApp({
      scanner: async () => {
        throw new Error('browser crashed');
      },
    });

    const created = await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'https://example.com' } });
    const job = await waitForJob(app, created.json().id);

    expect(job.error).toEqual({ url: null, reason: 'other', message: 'browser crashed' });
    await app.close();
  });

  it('rejects invalid input', async () => {
    const app = buildApp({ scanner: async (url) => emptyResult(url) });

    const badUrl = await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'ftp://example.com' } });
    const tooManyPages = await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com', maxPages: 500 } });
    const unknownJob = await app.inject({ method: 'GET', url: '/api/scans/nope' });

    expect(badUrl.statusCode).toBe(400);
    expect(badUrl.json().code).toBe('invalidUrl');
    expect(tooManyPages.statusCode).toBe(400);
    expect(unknownJob.statusCode).toBe(404);
    expect(unknownJob.json().code).toBe('scanNotFound');
    await app.close();
  });
});

describe('parseTargetUrl', () => {
  it('normalizes web addresses', () => {
    expect(parseTargetUrl('  example.com ')).toBe('https://example.com/');
    expect(parseTargetUrl('http://localhost:8080/page#top')).toBe('http://localhost:8080/page');
    expect(parseTargetUrl('localhost:4000')).toBe('http://localhost:4000/');
    expect(parseTargetUrl('www.example.com:8443/a')).toBe('https://www.example.com:8443/a');
  });

  it('rejects things that are not web addresses', () => {
    expect(parseTargetUrl('javascript:alert(1)')).toBeNull();
    expect(parseTargetUrl('hello')).toBeNull();
    expect(parseTargetUrl('mailto:a@b.it')).toBeNull();
  });
});

describe('loadConfig', () => {
  it('uses defaults when variables are missing', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      host: '127.0.0.1',
      appPassword: null,
      sessionSecret: null,
      blockPrivateTargets: false,
      trustProxy: false,
    });
    expect(loadConfig({ BLOCK_PRIVATE_TARGETS: 'true', APP_PASSWORD: 'x' })).toMatchObject({ blockPrivateTargets: true, appPassword: 'x' });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/non-negative integer/);
  });
});

describe('serving the built client', () => {
  const staticDir = mkdtempSync(join(tmpdir(), 'qa-client-'));
  mkdirSync(join(staticDir, 'assets'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>app</title>');

  it('serves files added after startup, the app for page URLs, and 404 for missing files', async () => {
    const app = buildApp({ staticDir });
    await app.ready();
    // Simulates `npm run build` while the server is running.
    writeFileSync(join(staticDir, 'assets', 'new.js'), 'console.log(1)');

    const asset = await app.inject({ method: 'GET', url: '/assets/new.js' });
    const page = await app.inject({ method: 'GET', url: '/report/123' });
    const missing = await app.inject({ method: 'GET', url: '/assets/old.js' });

    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('javascript');
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});

describe('stopping a scan', () => {
  /** A fake scanner that runs until it is stopped, like a long real scan. */
  const endlessScanner: Scanner = (_url, options, onProgress) =>
    new Promise((_resolve, reject) => {
      onProgress({ step: 'pages', done: 1, total: 10 });
      options.signal?.addEventListener('abort', () => reject(new ScanCancelledError()));
    });

  async function statusOf(app: ReturnType<typeof buildApp>, id: string): Promise<string> {
    return ((await app.inject({ method: 'GET', url: `/api/scans/${id}` })).json() as ScanJobView).status;
  }

  it('stops the running scan and starts the next one', async () => {
    let started = 0;
    const app = buildApp({
      scanner: (url, options, onProgress) => {
        started++;
        return endlessScanner(url, options, onProgress);
      },
    });
    const first = (await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com' } })).json().id;
    const second = (await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.org' } })).json().id;
    expect(await statusOf(app, first)).toBe('running');
    expect(await statusOf(app, second)).toBe('queued');

    const stopped = await app.inject({ method: 'POST', url: `/api/scans/${first}/cancel` });
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json()).toMatchObject({ status: 'cancelled', progress: null });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await statusOf(app, first)).toBe('cancelled');
    expect(await statusOf(app, second)).toBe('running');
    expect(started).toBe(2);
    await app.close();
  });

  it('drops a queued scan without ever starting it', async () => {
    let started = 0;
    const app = buildApp({
      scanner: (url, options, onProgress) => {
        started++;
        return endlessScanner(url, options, onProgress);
      },
    });
    await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com' } });
    const queued = (await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.org' } })).json().id;

    await app.inject({ method: 'POST', url: `/api/scans/${queued}/cancel` });

    expect(await statusOf(app, queued)).toBe('cancelled');
    expect(started).toBe(1);
    await app.close();
  });

  it('refuses to stop a finished scan and reports unknown ones', async () => {
    const app = buildApp({ scanner: async (url) => emptyResultFor(url) });
    const id = (await app.inject({ method: 'POST', url: '/api/scans', payload: { url: 'example.com' } })).json().id;
    await new Promise((resolve) => setTimeout(resolve, 20));

    const finished = await app.inject({ method: 'POST', url: `/api/scans/${id}/cancel` });
    const unknown = await app.inject({ method: 'POST', url: '/api/scans/nope/cancel' });

    expect(finished.statusCode).toBe(409);
    expect(finished.json().code).toBe('notCancellable');
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });
});

const emptyResultFor = (url: string): ScanResult => ({
  report: buildReport({ startUrl: url, pages: [], drafts: [], warnings: [], linksChecked: 0, imagesChecked: 0, durationMs: 1 }),
  screenshots: [],
});
