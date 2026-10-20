// Loading speed: Google's Core Web Vitals thresholds, page weight, and the usual causes of a slow page
// (no compression, no browser cache, heavy JPG/PNG images). Pure rules over data the browser collected.

import { rateSpeed, type IssueCode, type IssueParams, type Severity, type SPEED_THRESHOLDS } from '@qa/shared';
import type { IssueDraft, LoadedResource, PageData } from './types.ts';

const MAX_REQUESTS = 100;
/** Text files smaller than this gain little from compression. */
const COMPRESSIBLE_MIN_BYTES = 2048;
/** JPG/PNG images above this size are worth converting to WebP/AVIF. */
const LEGACY_IMAGE_MIN_BYTES = 100 * 1024;
const MAX_EXAMPLES = 20;

const COMPRESSIBLE_MIME = /^(text\/|application\/(javascript|json|xml|ld\+json)|image\/svg\+xml)/;
const STATIC_TYPES = new Set(['Script', 'Stylesheet', 'Image', 'Font']);

function issue(code: IssueCode, severity: Severity, pageUrl: string, params: IssueParams = {}): IssueDraft {
  return { code, category: 'performance', severity, pageUrl, params };
}

/** "Needs improvement" is a warning, "poor" is critical (thresholds in SPEED_THRESHOLDS, shared with the report). */
function level(metric: keyof typeof SPEED_THRESHOLDS, value: number): Severity | null {
  const rating = rateSpeed(metric, value);
  return rating === 'poor' ? 'critical' : rating === 'needsImprovement' ? 'warning' : null;
}

export function checkPerformance(page: PageData, siteOrigin: string): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const { metrics } = page;

  if (metrics) {
    const ttfb = level('ttfbMs', metrics.ttfbMs);
    if (ttfb) issues.push(issue('performance.slowServer', ttfb, page.url, { seconds: seconds(metrics.ttfbMs) }));

    const lcp = metrics.lcpMs === null ? null : level('lcpMs', metrics.lcpMs);
    if (lcp) issues.push(issue('performance.slowLcp', lcp, page.url, { seconds: seconds(metrics.lcpMs!) }));

    const cls = level('cls', metrics.cls);
    if (cls) issues.push(issue('performance.layoutShift', cls, page.url, { value: Math.round(metrics.cls * 100) / 100 }));

    const weight = level('bytes', metrics.bytes);
    if (weight) issues.push(issue('performance.heavyPage', weight, page.url, { size: formatBytes(metrics.bytes), requests: metrics.requests }));

    if (metrics.requests > MAX_REQUESTS) {
      issues.push(issue('performance.tooManyRequests', 'warning', page.url, { requests: metrics.requests, max: MAX_REQUESTS }));
    }
  }

  const downloaded = page.resources.filter((resource) => !resource.fromCache && resource.status >= 200 && resource.status < 300);

  const uncompressed = downloaded.filter(
    (resource) => COMPRESSIBLE_MIME.test(resource.mimeType) && resource.bytes > COMPRESSIBLE_MIN_BYTES && !resource.encoding,
  );
  if (uncompressed.length > 0) {
    issues.push(issue('performance.uncompressed', 'warning', page.url, { resources: describe(uncompressed) }));
  }

  // Only the site's own files: third-party caching is out of the developer's hands.
  const notCached = downloaded.filter((resource) => isOwnStaticFile(resource, siteOrigin) && !hasBrowserCache(resource));
  if (notCached.length > 0) {
    issues.push(issue('performance.noCache', 'info', page.url, { resources: describe(notCached) }));
  }

  const legacyImages = downloaded.filter(
    (resource) => /^image\/(jpeg|png)$/.test(resource.mimeType) && resource.bytes > LEGACY_IMAGE_MIN_BYTES,
  );
  if (legacyImages.length > 0) {
    issues.push(issue('performance.legacyImageFormats', 'info', page.url, { resources: describe(legacyImages) }));
  }

  return issues;
}

function isOwnStaticFile(resource: LoadedResource, siteOrigin: string): boolean {
  try {
    return STATIC_TYPES.has(resource.type) && new URL(resource.url).origin === siteOrigin;
  } catch {
    return false;
  }
}

/** A positive max-age (or s-maxage), or an Expires date, without no-store / no-cache. */
export function hasBrowserCache(resource: Pick<LoadedResource, 'cacheControl' | 'expires'>): boolean {
  const cacheControl = resource.cacheControl.toLowerCase();
  if (/no-store|no-cache/.test(cacheControl)) return false;
  const maxAge = /(?:s-)?max-age=(\d+)/.exec(cacheControl);
  if (maxAge) return Number(maxAge[1]) > 0;
  return resource.expires !== '' && resource.expires !== '0' && !Number.isNaN(Date.parse(resource.expires));
}

/** "https://site.it/app.js (240 KB)", biggest first. */
function describe(resources: LoadedResource[]): string[] {
  return [...resources]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, MAX_EXAMPLES)
    .map((resource) => `${resource.url} (${formatBytes(resource.bytes)})`);
}

function seconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
