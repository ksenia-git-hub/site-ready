import { describe, expect, it } from 'vitest';
import {
  checkDuplicateTitles,
  checkImages,
  checkMobile,
  checkSeo,
  classifyImage,
  classifyLink,
} from '../src/scan/checks.ts';
import type { IssueDraft, UrlCheckResult } from '../src/scan/types.ts';
import { goodPage } from './fixtures.ts';

const ok = (status: number, contentLength: number | null = null): UrlCheckResult => ({
  status,
  contentLength,
  contentType: null,
  failure: null,
  elapsedMs: 300,
});

const codes = (issues: IssueDraft[]) => issues.map((issue) => `${issue.severity}: ${issue.code}`);

describe('checkSeo', () => {
  it('finds nothing on a well-made page', () => {
    expect(checkSeo(goodPage)).toEqual([]);
  });

  it('flags missing basics and a leftover noindex', () => {
    const issues = checkSeo({ ...goodPage, title: null, metaDescription: null, h1Count: 0, lang: null, robots: 'noindex, nofollow' });

    expect(codes(issues)).toEqual([
      'critical: seo.titleMissing',
      'warning: seo.descriptionMissing',
      'warning: seo.h1Missing',
      'info: seo.langMissing',
      'critical: seo.noindex',
    ]);
    expect(issues.every((issue) => issue.category === 'seo')).toBe(true);
  });

  it('asks for a social preview when Open Graph tags are missing', () => {
    const [issue] = checkSeo({ ...goodPage, ogTitle: null, ogImage: null });
    expect(issue).toMatchObject({ code: 'seo.socialPreviewMissing', severity: 'info', params: { tags: ['og:title', 'og:image'] } });
  });

  it('passes the length that drives plural forms', () => {
    const [issue] = checkSeo({ ...goodPage, title: 'Home' });
    expect(issue).toMatchObject({ code: 'seo.titleTooShort', params: { title: 'Home', count: 4, min: 10 } });
  });
});

describe('checkDuplicateTitles', () => {
  it('groups pages with the same title', () => {
    const issues = checkDuplicateTitles([goodPage, { ...goodPage, url: 'https://site.it/b' }, { ...goodPage, url: 'https://site.it/c', title: 'Altro titolo' }]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.params).toMatchObject({ count: 2, pages: ['https://site.it/', 'https://site.it/b'] });
  });
});

describe('checkImages', () => {
  it('flags missing alt but accepts empty alt on decorative images', () => {
    const issues = checkImages({
      ...goodPage,
      images: [
        { src: 'https://site.it/no-alt.jpg', alt: null, renderedWidth: 100, naturalWidth: 100 },
        { src: 'https://site.it/decor.png', alt: '', renderedWidth: 100, naturalWidth: 100 },
      ],
    });

    expect(codes(issues)).toEqual(['warning: images.altMissing']);
    expect(issues[0]?.params).toEqual({ count: 1, images: ['https://site.it/no-alt.jpg'] });
  });

  it('flags images much wider than displayed', () => {
    const issues = checkImages({
      ...goodPage,
      images: [{ src: 'https://site.it/huge.jpg', alt: 'x', renderedWidth: 300, naturalWidth: 4000 }],
    });

    expect(codes(issues)).toEqual(['info: images.oversized']);
    expect(issues[0]?.params.images).toEqual(['https://site.it/huge.jpg (4000px → 300px)']);
  });
});

describe('checkMobile', () => {
  it('flags a missing viewport and horizontal scrolling', () => {
    const issues = checkMobile(
      { ...goodPage, hasViewportMeta: false },
      { viewportWidth: 375, scrollWidth: 900, overflowing: ['div.wide (900px)'] },
    );

    expect(codes(issues)).toEqual(['critical: mobile.viewportMissing', 'warning: mobile.horizontalScroll']);
    expect(issues[1]?.params.elements).toEqual(['div.wide (900px)']);
  });
});

describe('classifyLink', () => {
  const pages = ['https://site.it/'];

  it('ignores working links and treats 404 as critical', () => {
    expect(classifyLink('https://site.it/ok', ok(200), pages, true)).toBeNull();
    expect(classifyLink('https://site.it/old', ok(404), pages, true)?.code).toBe('links.notFoundInternal');
    expect(classifyLink('https://other.it/old', ok(404), pages, false)?.code).toBe('links.notFoundExternal');
  });

  it('reports links that work but answer very slowly, instead of calling them broken', () => {
    expect(classifyLink('https://site.it/catalog/', { ...ok(200), elapsedMs: 17_000 }, pages, true)).toMatchObject({
      code: 'links.slowResponse',
      severity: 'warning',
      params: { seconds: 17 },
    });
    expect(classifyLink('https://site.it/fast/', { ...ok(200), elapsedMs: 2_000 }, pages, true)).toBeNull();
  });

  it('does not blame external sites that block bots', () => {
    expect(classifyLink('https://linkedin.com/x', ok(999), pages, false)).toMatchObject({ code: 'links.blocked', severity: 'info' });
    expect(classifyLink('https://site.it/private', ok(403), pages, true)).toMatchObject({ code: 'links.httpError', severity: 'warning' });
  });

  it('reports network errors with their reason', () => {
    const issue = classifyLink(
      'https://nope.invalid/',
      { ...ok(0), status: null, failure: { reason: 'dns' } },
      pages,
      false,
    );
    expect(issue).toMatchObject({ code: 'links.unreachable', severity: 'warning', params: { reason: 'dns', foundOn: pages } });
  });
});

describe('classifyImage', () => {
  const pages = ['https://site.it/'];

  it('flags broken and heavy images', () => {
    expect(classifyImage('https://site.it/x.jpg', ok(404), pages)[0]).toMatchObject({
      code: 'images.broken',
      params: { reason: 'http', status: 404 },
    });
    expect(classifyImage('https://site.it/y.jpg', ok(200, 2_000_000), pages)[0]).toMatchObject({
      code: 'images.heavy',
      params: { size: '1.9 MB', limit: '500 KB' },
    });
    expect(classifyImage('https://site.it/z.jpg', ok(200, 50_000), pages)).toEqual([]);
  });
});
