import type { ApiError, CreateScanRequest, CreateScanResponse, HealthResponse, ScanJobView } from '@qa/shared';

/** A failed API call. Kept as data (not a sentence) so the UI can show it in the current language. */
export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(status: number | null, body: ApiError = {}) {
    super(body.message ?? (status === null ? 'Network error' : `HTTP ${status}`));
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code ?? null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new ApiRequestError(null);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    throw new ApiRequestError(response.status, body);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>('/api/health', { signal }),

  createScan: (body: CreateScanRequest) =>
    request<CreateScanResponse>('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** Stops a queued or running scan; 409 if it has already finished. */
  cancelScan: (id: string) => request<ScanJobView>(`/api/scans/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),

  getScan: (id: string, signal?: AbortSignal) => request<ScanJobView>(`/api/scans/${encodeURIComponent(id)}`, { signal }),
};
