import type { ApiError, CreateScanRequest, CreateScanResponse, ScanJobView, SessionResponse } from '@qa/shared';

/** Fired when the server answers "log in first" (session expired, password changed): the app shows the login. */
export const UNAUTHORIZED_EVENT = 'site-ready:unauthorized';

/** A failed API call. Kept as data (not a sentence) so the UI can show it in the current language. */
export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  /** The server's own message (Fastify validation errors), when there is one. */
  readonly serverMessage: string | null;

  constructor(status: number | null, body: ApiError = {}) {
    super(body.message ?? (status === null ? 'Network error' : `HTTP ${status}`));
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code ?? null;
    this.serverMessage = body.message ?? null;
  }

  /**
   * The server can't be reached right now, but may be back soon: no connection, or the hosting's
   * proxy answering for it while the app restarts (502/503/504).
   */
  get isTemporary(): boolean {
    return this.status === null || this.status === 502 || this.status === 503 || this.status === 504;
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
    if (response.status === 401 && body.code === 'unauthorized') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiRequestError(response.status, body);
  }
  return response.json() as Promise<T>;
}

export const api = {
  /** Whether a password is needed and whether this browser is logged in; also tells if the server is up. */
  session: (signal?: AbortSignal) => request<SessionResponse>('/api/session', { signal }),

  login: (password: string) =>
    request<{ ok: true }>('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }),

  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),

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
