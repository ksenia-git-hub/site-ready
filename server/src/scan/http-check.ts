import type { Failure } from '@qa/shared';
import type { UrlCheckResult } from './types.ts';

const USER_AGENT = 'Mozilla/5.0 (compatible; SiteReady/0.1)';
/** Slow pages (some answer after 15–20 s) are reported as slow, not as unreachable: wait long enough. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Checks a URL with HEAD (cheap) and falls back to GET when HEAD fails,
 * because many servers answer HEAD with 403/404/405 while GET works fine.
 */
export async function checkUrl(url: string, timeoutMs = DEFAULT_TIMEOUT_MS, cancel?: AbortSignal): Promise<UrlCheckResult> {
  const started = Date.now();
  try {
    let result = await request(url, 'HEAD', timeoutMs, cancel);
    if (result.status !== null && result.status >= 400) {
      result = await request(url, 'GET', timeoutMs, cancel);
    }
    return result;
  } catch (error) {
    return { status: null, contentLength: null, contentType: null, failure: describeError(error, timeoutMs), elapsedMs: Date.now() - started };
  }
}

async function request(url: string, method: 'HEAD' | 'GET', timeoutMs: number, cancel?: AbortSignal): Promise<UrlCheckResult> {
  const started = Date.now();
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, {
    method,
    redirect: 'follow',
    signal: cancel ? AbortSignal.any([timeout, cancel]) : timeout,
    headers: { 'user-agent': USER_AGENT, accept: '*/*' },
  });
  // Only the headers matter: don't download the body.
  await response.body?.cancel();
  const length = Number(response.headers.get('content-length'));
  return {
    status: response.status,
    contentLength: Number.isFinite(length) && length > 0 ? length : null,
    contentType: response.headers.get('content-type'),
    failure: null,
    // Time of this request only: a HEAD that failed fast before the GET shouldn't count.
    elapsedMs: Date.now() - started,
  };
}

function describeError(error: unknown, timeoutMs: number): Failure {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { reason: 'timeout', seconds: timeoutMs / 1000 };
  }
  const code = (error as { cause?: { code?: string } })?.cause?.code;
  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return { reason: 'dns' };
    case 'ECONNREFUSED':
      return { reason: 'refused' };
    case 'ECONNRESET':
      return { reason: 'reset' };
    case 'CERT_HAS_EXPIRED':
      return { reason: 'certExpired' };
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return { reason: 'certInvalid' };
  }
  return { reason: 'other', message: error instanceof Error ? error.message : String(error) };
}

/** Like Promise.all over items, but with at most `limit` calls in flight. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
