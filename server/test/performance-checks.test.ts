import { describe, expect, it } from 'vitest';
import { checkPerformance, hasBrowserCache } from '../src/scan/performance-checks.ts';
import type { LoadedResource } from '../src/scan/types.ts';
import { goodPage } from './fixtures.ts';

const ORIGIN = 'https://site.it';
const fastMetrics = { ttfbMs: 200, lcpMs: 1200, cls: 0.01, loadMs: 900, bytes: 900_000, requests: 30 };

const resource = (overrides: Partial<LoadedResource>): LoadedResource => ({
  url: `${ORIGIN}/app.js`,
  type: 'Script',
  mimeType: 'application/javascript',
  status: 200,
  bytes: 50_000,
  encoding: 'br',
  cacheControl: 'public, max-age=31536000',
  expires: '',
  fromCache: false,
  ...overrides,
});

const codes = (page: typeof goodPage) => checkPerformance(page, ORIGIN).map((issue) => `${issue.severity}: ${issue.code}`);

describe('checkPerformance', () => {
  it('finds nothing on a fast, light page with compressed and cached files', () => {
    expect(codes({ ...goodPage, metrics: fastMetrics, resources: [resource({})] })).toEqual([]);
  });

  it('grades the Core Web Vitals with Google’s thresholds', () => {
    const slow = { ...fastMetrics, ttfbMs: 2100, lcpMs: 3000, cls: 0.3 };
    expect(codes({ ...goodPage, metrics: slow })).toEqual([
      'critical: performance.slowServer',
      'warning: performance.slowLcp',
      'critical: performance.layoutShift',
    ]);
    const [server] = checkPerformance({ ...goodPage, metrics: slow }, ORIGIN);
    expect(server?.params).toEqual({ seconds: 2.1 });
  });

  it('flags heavy pages and too many requests', () => {
    const heavy = { ...fastMetrics, bytes: 4 * 1024 * 1024, requests: 140 };
    const issues = checkPerformance({ ...goodPage, metrics: heavy }, ORIGIN);
    expect(issues.map((issue) => `${issue.severity}: ${issue.code}`)).toEqual([
      'warning: performance.heavyPage',
      'warning: performance.tooManyRequests',
    ]);
    expect(issues[0]?.params).toEqual({ size: '4.0 MB', requests: 140 });
  });

  it('finds uncompressed text files, uncached own files and heavy JPG/PNG', () => {
    const issues = checkPerformance(
      {
        ...goodPage,
        metrics: fastMetrics,
        resources: [
          resource({ encoding: '', cacheControl: '' }),
          resource({ url: `${ORIGIN}/hero.jpg`, type: 'Image', mimeType: 'image/jpeg', bytes: 400_000, encoding: '' }),
          // Third-party files: their cache headers are not the developer’s responsibility.
          resource({ url: 'https://cdn.other.com/lib.js', cacheControl: '' }),
          // Small files and images are not worth compressing.
          resource({ url: `${ORIGIN}/small.css`, mimeType: 'text/css', bytes: 900, encoding: '' }),
        ],
      },
      ORIGIN,
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      'performance.uncompressed',
      'performance.noCache',
      'performance.legacyImageFormats',
    ]);
    expect(issues[0]?.params.resources).toEqual([`${ORIGIN}/app.js (49 KB)`]);
    expect(issues[1]?.params.resources).toEqual([`${ORIGIN}/app.js (49 KB)`]);
    expect(issues[2]?.params.resources).toEqual([`${ORIGIN}/hero.jpg (391 KB)`]);
  });

  it('ignores failed downloads and files already in the browser cache', () => {
    const resources = [resource({ status: 404, encoding: '' }), resource({ fromCache: true, encoding: '' })];
    expect(codes({ ...goodPage, metrics: fastMetrics, resources })).toEqual([]);
  });
});

describe('hasBrowserCache', () => {
  it('accepts max-age and Expires, refuses no-store / no-cache / max-age=0', () => {
    expect(hasBrowserCache({ cacheControl: 'max-age=3600', expires: '' })).toBe(true);
    expect(hasBrowserCache({ cacheControl: '', expires: 'Wed, 21 Oct 2027 07:28:00 GMT' })).toBe(true);
    expect(hasBrowserCache({ cacheControl: 'no-store', expires: '' })).toBe(false);
    expect(hasBrowserCache({ cacheControl: 'max-age=0, must-revalidate', expires: '' })).toBe(false);
    expect(hasBrowserCache({ cacheControl: '', expires: '' })).toBe(false);
  });
});
