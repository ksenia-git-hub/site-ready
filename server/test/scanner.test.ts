// End-to-end test of the real scanner: starts Chromium and scans the local demo site.
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTargetGuard } from '../src/scan/network-guard.ts';
import { runScan } from '../src/scan/scanner.ts';
import { ScanCancelledError, ScanError } from '../src/scan/types.ts';
import { startDemoSite, startRussianDemoSite } from './demo-site.ts';

describe('runScan on the demo site', () => {
  let site: { url: string; server: Server };
  beforeAll(async () => {
    site = await startDemoSite();
  });
  afterAll(() => site.server.close());

  it('finds the deliberate problems', { timeout: 120_000 }, async () => {
    const steps = new Set<string>();
    const { report, screenshots } = await runScan(site.url, { maxPages: 10 }, (progress) => steps.add(progress.step));

    expect(report.pages.map((page) => page.url).sort()).toEqual([site.url, `${site.url}chi-siamo`, `${site.url}contatti`].sort());

    const found = report.issues.map((issue) => `${issue.severity}: ${issue.code}`);
    expect(found.sort()).toEqual(
      [
        'critical: links.notFoundInternal', // /pagina-sparita
        'critical: links.notFoundInternal', // /mappa
        'warning: links.unreachable', // dominio-inesistente.invalid
        'warning: links.unreachable', // staging.studio-demo.invalid
        'critical: images.broken',
        'warning: images.heavy',
        'warning: images.altMissing',
        'critical: seo.noindex',
        'warning: seo.titleTooShort',
        'warning: seo.descriptionMissing',
        'warning: seo.titleDuplicate',
        'info: seo.socialPreviewMissing',
        'info: seo.socialPreviewMissing',
        'info: seo.socialPreviewMissing',
        'critical: seo.robotsBlocksAll',
        'warning: seo.sitemapMissing',
        'warning: seo.faviconMissing',
        'critical: mobile.viewportMissing',
        'warning: mobile.horizontalScroll',
        'warning: performance.uncompressed', // /js/app.js
        'warning: performance.slowServer', // /chi-siamo answers after 1.2 s
        'warning: performance.layoutShift', // /contatti late banner
        'info: performance.noCache',
        'info: performance.legacyImageFormats', // pesante.png
        'warning: technical.jsErrors',
        'warning: technical.failedResources',
        'warning: technical.default404Page',
        'critical: content.placeholderText',
        'critical: content.devLinks',
        'warning: content.placeholderContact',
        'warning: content.todoText',
        'warning: legal.privacyMissing',
        'warning: legal.cookiePolicyMissing',
        'warning: legal.cookieBannerMissing',
        'critical: legal.cookiesBeforeConsent',
        'warning: legal.vatMissing',
        'critical: accessibility.buttonName',
        'warning: accessibility.colorContrast',
        'warning: accessibility.headingOrder',
        'warning: accessibility.zoomDisabled',
        'info: accessibility.genericLinkText',
      ].sort(),
    );
    // Most severe first.
    expect(report.issues[0]?.severity).toBe('critical');
    expect([...steps]).toEqual(['starting', 'pages', 'links', 'images']);

    // Speed is measured on every page.
    expect(report.pages.every((page) => page.metrics !== null && page.metrics.requests > 0)).toBe(true);

    // A desktop and a phone JPEG for every page.
    expect(report.pages.every((page) => page.screenshots)).toBe(true);
    expect(screenshots).toHaveLength(3);
    for (const shot of screenshots) {
      expect(shot.desktop?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
      expect(shot.mobile?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    }
  });

  it('finds the same problems in low-memory mode, with lighter screenshots', { timeout: 120_000 }, async () => {
    const normal = await runScan(site.url, { maxPages: 1 }, () => {});
    const light = await runScan(site.url, { maxPages: 1, lowMemory: true }, () => {});

    const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code).sort();
    expect(codes(light.report.issues)).toEqual(codes(normal.report.issues));
    expect(light.screenshots[0]?.desktop?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(light.screenshots[0]!.mobile!.length).toBeLessThan(normal.screenshots[0]!.mobile!.length);
  });

  it('stops quickly when cancelled in the middle of the crawl', { timeout: 60_000 }, async () => {
    const controller = new AbortController();
    const started = Date.now();
    const scan = runScan(site.url, { maxPages: 10, signal: controller.signal }, (progress) => {
      // Stop as soon as the first page is being analyzed.
      if (progress.step === 'pages') controller.abort();
    });

    await expect(scan).rejects.toBeInstanceOf(ScanCancelledError);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('refuses to open internal addresses when the guard is on', { timeout: 60_000 }, async () => {
    // The demo site runs on localhost: with the guard, the browser must not load it.
    const scan = runScan(site.url, { maxPages: 1, guard: createTargetGuard() }, () => {});
    await expect(scan).rejects.toMatchObject({ failure: { reason: 'blocked' } });
  });

  it('fails with a reason when the start page does not open', { timeout: 60_000 }, async () => {
    const failure = runScan(`${site.url}non-esiste`, { maxPages: 1 }, () => {});
    await expect(failure).rejects.toBeInstanceOf(ScanError);
    await expect(failure).rejects.toMatchObject({ failure: { reason: 'http', status: 404 } });
  });
});

describe('runScan on the Russian demo shop', () => {
  it('applies the Russian law checks', { timeout: 120_000 }, async () => {
    const site = await startRussianDemoSite();
    try {
      const { report } = await runScan(site.url, { maxPages: 1 }, () => {});
      const legal = report.issues.filter((issue) => issue.category === 'legal').map((issue) => `${issue.severity}: ${issue.code}`);
      expect(legal.sort()).toEqual(
        [
          'warning: legal.ruConsentMissing',
          'warning: legal.ruConsentNotClickable',
          'warning: legal.ruForeignServices',
          'warning: legal.ruSellerDetailsMissing',
          'warning: legal.ruForeignLanguage',
          'warning: legal.cookieBannerMissing',
          'critical: legal.cookiesBeforeConsent',
        ].sort(),
      );
      // The Italian VAT number is not required on a Russian site.
      expect(legal).not.toContain('warning: legal.vatMissing');
    } finally {
      site.server.close();
    }
  });
});
