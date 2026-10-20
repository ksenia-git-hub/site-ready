import { describe, expect, it } from 'vitest';
import type { Issue, IssueCode, Severity } from '@qa/shared';
import { categoryScores, gradeOf, priorityProblems, qualityScore, scoreColor, scoreGradient } from './score.ts';

let id = 0;
const issue = (code: IssueCode, severity: Severity, pageUrl: string, params: Issue['params'] = {}): Issue => ({
  id: String(++id),
  code,
  category: code.slice(0, code.indexOf('.')) as Issue['category'],
  severity,
  pageUrl,
  params,
});
const pages = Array.from({ length: 10 }, (_, i) => `https://site.it/${i}`);
const score = (issues: Issue[], pagesScanned = 10) => qualityScore({ issues, summary: { pagesScanned } });

describe('qualityScore', () => {
  it('is 100 only for a clean site; suggestions lower it just a little', () => {
    expect(score([])).toBe(100);
    expect(score(pages.map((page) => issue('seo.socialPreviewMissing', 'info', page)))).toBe(99);
  });

  it('counts a kind of problem once, scaled by how many pages it affects', () => {
    const onePage = score([issue('images.altMissing', 'warning', pages[0]!)]);
    const everyPage = score(pages.map((page) => issue('images.altMissing', 'warning', page)));
    expect(onePage).toBe(98);
    // The same problem on 10 pages costs more, but nowhere near 10 times more.
    expect(everyPage).toBe(97);
  });

  it('uses the pages listed in foundOn for site-wide problems like broken links', () => {
    const brokenLink = issue('links.notFoundInternal', 'critical', pages[0]!, { foundOn: pages });
    expect(score([brokenLink])).toBe(81);
    expect(score([issue('links.notFoundInternal', 'critical', pages[0]!, { foundOn: [pages[0]!] })])).toBe(88);
  });

  it('gives a typical real site with a few errors and many warnings a middle score, not zero', () => {
    const critical = ['links.notFoundInternal', 'images.broken', 'seo.noindex'] as const;
    const warnings = [
      'images.altMissing',
      'images.heavy',
      'seo.titleTooLong',
      'seo.descriptionMissing',
      'seo.titleDuplicate',
      'mobile.horizontalScroll',
      'technical.jsErrors',
      'performance.noCache',
      'accessibility.colorContrast',
      'legal.cookieBannerMissing',
    ] as const;
    const issues = [
      ...critical.map((code, i) => issue(code, 'critical', pages[i]!)),
      // Warnings repeated on many pages, as on real sites (58 occurrences in total).
      ...warnings.flatMap((code) => pages.slice(0, 6).map((page) => issue(code, 'warning', page))),
      ...pages.map((page) => issue('seo.socialPreviewMissing', 'info', page)),
    ];
    expect(score(issues)).toBeGreaterThanOrEqual(50);
    expect(score(issues)).toBeLessThan(75);
  });

  it('never reaches 0, but stays low for a site broken everywhere', () => {
    const codes = ['links.notFoundInternal', 'images.broken', 'seo.noindex', 'seo.robotsBlocksAll', 'mobile.viewportMissing'] as const;
    const issues = codes.flatMap((code) => pages.map((page) => issue(code, 'critical', page)));
    expect(score(issues)).toBeGreaterThan(0);
    expect(score(issues)).toBeLessThan(50);
  });

  it('maps scores to grades', () => {
    expect([95, 80, 60, 10].map(gradeOf)).toEqual(['excellent', 'good', 'fair', 'poor']);
  });
});

describe('priorityProblems', () => {
  it('puts the problems that cost the most points first, and never suggestions', () => {
    const issues = [
      ...pages.map((page) => issue('seo.socialPreviewMissing', 'info', page)),
      ...pages.slice(0, 2).map((page) => issue('images.altMissing', 'warning', page)),
      issue('seo.noindex', 'critical', pages[0]!),
      ...pages.map((page) => issue('mobile.viewportMissing', 'critical', page)),
    ];

    const top = priorityProblems({ issues, summary: { pagesScanned: 10 } });

    expect(top.map((kind) => kind.key)).toEqual(['critical:mobile.viewportMissing', 'critical:seo.noindex', 'warning:images.altMissing']);
    expect(top[0]).toMatchObject({ affectedPages: 10, issues: { length: 10 } });
  });

  it('keeps at most 5 and is empty on a site with only suggestions', () => {
    const codes = ['links.notFoundInternal', 'images.broken', 'seo.noindex', 'seo.robotsBlocksAll', 'mobile.viewportMissing', 'content.devLinks'] as const;
    expect(priorityProblems({ issues: codes.map((code) => issue(code, 'critical', pages[0]!)), summary: { pagesScanned: 10 } })).toHaveLength(5);
    expect(priorityProblems({ issues: [issue('seo.langMissing', 'info', pages[0]!)], summary: { pagesScanned: 10 } })).toEqual([]);
  });
});

describe('site-wide problems', () => {
  it('count as affecting every page, even though they are reported once', () => {
    const [kind] = priorityProblems({ issues: [issue('seo.robotsBlocksAll', 'critical', pages[0]!)], summary: { pagesScanned: 10 } });
    expect(kind).toMatchObject({ siteWide: true, affectedPages: 10, impact: 12 });
  });
});

describe('categoryScores', () => {
  it('scores each category on its own problems, on the same scale as the overall score', () => {
    const scores = categoryScores({
      issues: [
        ...pages.map((page) => issue('mobile.viewportMissing', 'critical', page)),
        issue('images.altMissing', 'warning', pages[0]!),
        issue('seo.langMissing', 'info', pages[0]!),
      ],
      summary: { pagesScanned: 10 },
    });

    expect(scores.mobile).toEqual({ score: 63, issues: 10 });
    expect(gradeOf(scores.mobile.score)).toBe('fair');
    expect(scores.images.score).toBeGreaterThanOrEqual(90);
    // A single suggestion costs a point or two: 100 means nothing at all was found.
    expect(scores.seo).toEqual({ score: 99, issues: 1 });
    expect(scores.links).toEqual({ score: 100, issues: 0 });
  });
});

describe('scoreColor', () => {
  it('gives each grade its own clean color, the same within a grade', () => {
    expect(scoreColor(100)).toBe(scoreColor(92));
    expect(new Set([95, 80, 60, 10].map(scoreColor)).size).toBe(4);
  });

  it('builds gradients from two tones of the same hue', () => {
    for (const score of [95, 80, 60, 10]) {
      const hues = [...scoreGradient(score).matchAll(/oklch\([\d.]+ [\d.]+ (\d+)\)/g)].map((match) => Number(match[1]));
      expect(hues).toHaveLength(2);
      // Same family of color: the light end may be a touch warmer (amber → yellow), never another color.
      expect(Math.abs(hues[0]! - hues[1]!)).toBeLessThanOrEqual(20);
    }
  });
});
