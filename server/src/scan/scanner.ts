import { chromium, devices, type BrowserContext, type Page } from 'playwright';
import type { Failure, ScanWarning } from '@qa/shared';
import { checkAccessibility, runAxe } from './accessibility.ts';
import { checkCookiesBeforeConsent } from './cookie-checks.ts';
import { checkDuplicateTitles, checkImages, checkMobile, checkSeo, classifyImage, classifyLink, isHttpUrl } from './checks.ts';
import { extractMobile, extractPage, observeSpeed, readSpeed, scrollThrough, scrollToTop } from './extract.ts';
import { checkPerformance } from './performance-checks.ts';
import { RU_CONSENT, checkContent, checkLegal, checkTechnical } from './handover-checks.ts';
import { checkUrl, mapWithConcurrency } from './http-check.ts';
import { buildReport } from './report.ts';
import { checkSite } from './site-checks.ts';
import {
  ScanCancelledError,
  ScanError,
  type AxeViolation,
  type DomData,
  type LoadedResource,
  type IssueDraft,
  type MobileData,
  type NetworkData,
  type PageData,
  type PageScreenshots,
  type ProgressFn,
  type ScanOptions,
  type Scanner,
  type UrlCheckResult,
} from './types.ts';

/** How pages are loaded and captured; lighter on a small server. */
interface CaptureSettings {
  navigationTimeoutMs: number;
  /** Screenshots cover the whole page, up to this height (CSS pixels) for very long pages. */
  maxPageHeight: number;
  jpegQuality: number;
  /** Phone rendering density: 2 is sharper, 1 needs a quarter of the memory. */
  phoneScale: number;
}
const NORMAL_CAPTURE: CaptureSettings = { navigationTimeoutMs: 30_000, maxPageHeight: 15_000, jpegQuality: 60, phoneScale: 2 };
/** A tiny CPU loads pages slowly, and long full-page screenshots can run out of memory. */
const LOW_MEMORY_CAPTURE: CaptureSettings = { navigationTimeoutMs: 60_000, maxPageHeight: 5_000, jpegQuality: 45, phoneScale: 1 };
/** Requests remembered per page (for dev links, trackers and mixed content). */
const MAX_REQUESTS_PER_PAGE = 500;
const MAX_LINKS = 500;
const MAX_IMAGES = 300;
/** Parallel HTTP checks: enough to be fast, few enough not to hammer the site. */
const HTTP_CONCURRENCY = 5;
/** Links to these files are checked but not opened as pages. */
const NON_PAGE_EXTENSION = /\.(pdf|zip|rar|7z|gz|jpe?g|png|gif|webp|avif|svg|ico|mp4|webm|mp3|wav|docx?|xlsx?|pptx?|csv|txt|xml|json)$/i;
/** Narrow phone (iPhone SE/mini class): the strictest common width. */
const MOBILE_CONTEXT = {
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
  userAgent: devices['Pixel 7']!.userAgent,
};

/**
 * Visits up to maxPages pages of the same site (breadth-first, starting from the given URL),
 * checks each page at desktop and phone size (taking screenshots), then checks every link and image
 * found via HTTP, and finally the site as a whole (robots.txt, sitemap, HTTPS, legal pages).
 */
export const runScan: Scanner = (startUrl, options, onProgress) => {
  const { signal } = options;
  if (!signal) return scanSite(startUrl, options, onProgress);
  // Whatever the browser is busy with when the user presses stop, the scan ends right away;
  // scanSite notices the signal too and closes its browser in the background.
  const stopped = new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(new ScanCancelledError());
    signal.addEventListener('abort', () => reject(new ScanCancelledError()), { once: true });
  });
  const scan = scanSite(startUrl, options, onProgress);
  // After a stop, scanSite's own outcome no longer matters.
  scan.catch(() => {});
  return Promise.race([scan, stopped]);
};

const scanSite: Scanner = async (startUrl, options, onProgress) => {
  const startedAt = Date.now();
  const { signal } = options;
  const throwIfCancelled = () => {
    if (signal?.aborted) throw new ScanCancelledError();
  };
  throwIfCancelled();
  onProgress({ step: 'starting' });
  const capture = options.lowMemory ? LOW_MEMORY_CAPTURE : NORMAL_CAPTURE;
  // Docker gives containers a tiny /dev/shm: Chromium would crash on big pages without this flag.
  const args = ['--disable-dev-shm-usage'];
  // One renderer process for all tabs, no GPU process: less memory on a small server.
  if (options.lowMemory) args.push('--renderer-process-limit=1', '--disable-gpu');
  const browser = await chromium.launch({ args });
  // Stopping closes the browser at once: a page that is loading fails and the crawl ends.
  const closeOnCancel = () => void browser.close();
  signal?.addEventListener('abort', closeOnCancel, { once: true });

  try {
    const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await desktop.addInitScript(observeSpeed);
    const mobile = await browser.newContext({ ...MOBILE_CONTEXT, deviceScaleFactor: capture.phoneScale });
    if (options.guard) {
      // Pages, redirects, scripts, images…: nothing may come from an internal network.
      const guard = options.guard;
      for (const context of [desktop, mobile]) {
        await context.route('**/*', async (route) =>
          (await guard(route.request().url())) ? route.continue() : route.abort('blockedbyclient'),
        );
      }
    }
    const check = async (url: string): Promise<UrlCheckResult> =>
      options.guard && !(await options.guard(url))
        ? { status: null, contentLength: null, contentType: null, failure: { reason: 'blocked' }, elapsedMs: 0 }
        : checkUrl(url, undefined, signal);

    const crawl = await crawlSite(startUrl, options, { desktop, mobile, capture }, onProgress);
    throwIfCancelled();
    // Nobody clicked "Accept" on a cookie banner: every cookie here was set before consent.
    const cookies = [...(await desktop.cookies()), ...(await mobile.cookies())];
    // The browser is no longer needed: free its memory before the HTTP checks.
    await browser.close();

    // Runs while links and images are checked; it only needs the network.
    const siteIssues = checkSite(crawl.origin, crawl.pages[0]!);
    const drafts: IssueDraft[] = [
      ...crawl.drafts,
      ...checkDuplicateTitles(crawl.pages),
      ...checkLegal(crawl.pages, startUrl),
      ...checkCookiesBeforeConsent(cookies, crawl.pages[0]!.url),
    ];
    const warnings = [...crawl.warnings];
    const visited = new Set(crawl.pages.map((page) => page.url));
    const isInternal = (url: string) => new URL(url).origin === crawl.origin;

    // Pages already opened in the browser are known to work: no need to check them again.
    const links = limit([...crawl.linkRefs].filter(([url]) => !visited.has(url)), MAX_LINKS, 'linkLimit', warnings);
    let linksDone = 0;
    await mapWithConcurrency(links, HTTP_CONCURRENCY, async ([url, foundOn]) => {
      if (signal?.aborted) return;
      const issue = classifyLink(url, await check(url), [...foundOn], isInternal(url));
      if (issue) drafts.push(issue);
      onProgress({ step: 'links', done: ++linksDone, total: links.length });
    });

    throwIfCancelled();

    const images = limit([...crawl.imageRefs], MAX_IMAGES, 'imageLimit', warnings);
    let imagesDone = 0;
    await mapWithConcurrency(images, HTTP_CONCURRENCY, async ([url, foundOn]) => {
      if (signal?.aborted) return;
      drafts.push(...classifyImage(url, await check(url), [...foundOn]));
      onProgress({ step: 'images', done: ++imagesDone, total: images.length });
    });

    throwIfCancelled();
    drafts.push(...(await siteIssues));

    const report = buildReport({
      startUrl,
      pages: crawl.pages.map((page, index) => ({
        url: page.url,
        title: page.title,
        screenshots: Boolean(crawl.screenshots[index]?.desktop || crawl.screenshots[index]?.mobile),
        metrics: page.metrics,
      })),
      drafts,
      warnings,
      linksChecked: links.length,
      imagesChecked: images.length,
      durationMs: Date.now() - startedAt,
    });
    return { report, screenshots: crawl.screenshots };
  } catch (error) {
    // Whatever broke after the user pressed stop (closed browser, aborted requests) is just the stop.
    if (signal?.aborted) throw new ScanCancelledError();
    throw error;
  } finally {
    signal?.removeEventListener('abort', closeOnCancel);
    await browser.close();
  }
};

interface CrawlResult {
  /** Origin of the site after redirects of the start page (e.g. http → https, adding www). */
  origin: string;
  pages: PageData[];
  /** Same order as pages. */
  screenshots: PageScreenshots[];
  drafts: IssueDraft[];
  warnings: ScanWarning[];
  /** URL → pages on which it was found. */
  linkRefs: Map<string, Set<string>>;
  imageRefs: Map<string, Set<string>>;
}

async function crawlSite(
  startUrl: string,
  options: ScanOptions,
  browser: BrowserSetup,
  onProgress: ProgressFn,
): Promise<CrawlResult> {
  const queue = [normalizeUrl(startUrl)!];
  const seen = new Set(queue);
  const result: CrawlResult = {
    origin: new URL(startUrl).origin,
    pages: [],
    screenshots: [],
    drafts: [],
    warnings: [],
    linkRefs: new Map(),
    imageRefs: new Map(),
  };

  while (queue.length > 0 && result.pages.length < options.maxPages) {
    if (options.signal?.aborted) throw new ScanCancelledError();
    const url = queue.shift()!;
    const total = Math.min(options.maxPages, result.pages.length + queue.length + 1);
    onProgress({ step: 'pages', done: result.pages.length + 1, total, url });

    const visit = await visitPage(url, browser);
    if ('failure' in visit) {
      // The start page must work; other failing pages show up in the link check.
      if (result.pages.length === 0) throw new ScanError(url, visit.failure);
      continue;
    }

    const { page, mobileData, screenshots } = visit;
    if (result.pages.length === 0) result.origin = new URL(page.url).origin;
    seen.add(page.url);
    result.pages.push(page);
    result.screenshots.push(screenshots);
    result.drafts.push(
      ...checkSeo(page),
      ...checkImages(page),
      ...checkMobile(page, mobileData),
      ...checkTechnical(page),
      ...checkContent(page, new URL(result.origin).hostname),
      ...checkAccessibility(page),
      ...checkPerformance(page, result.origin),
    );

    for (const link of page.links) {
      const target = normalizeUrl(link);
      if (!target) continue;
      addRef(result.linkRefs, target, page.url);
      if (new URL(target).origin === result.origin && !seen.has(target) && !NON_PAGE_EXTENSION.test(new URL(target).pathname)) {
        seen.add(target);
        queue.push(target);
      }
    }
    for (const image of page.images) {
      if (isHttpUrl(image.src)) addRef(result.imageRefs, image.src, page.url);
    }
  }

  if (queue.length > 0) {
    // Pages left out still had their links checked over HTTP.
    result.warnings.push({ code: 'pageLimit', max: options.maxPages, count: queue.length });
  }
  return result;
}

type Visit = { page: PageData; mobileData: MobileData | null; screenshots: PageScreenshots } | { failure: Failure };

interface BrowserSetup {
  desktop: BrowserContext;
  mobile: BrowserContext;
  capture: CaptureSettings;
}

async function visitPage(url: string, { desktop, mobile, capture }: BrowserSetup): Promise<Visit> {
  let dom: DomData;
  let desktopShot: Buffer | null = null;
  let accessibility: AxeViolation[] = [];
  let speed: Awaited<ReturnType<typeof readSpeed>> = null;
  const tab = await desktop.newPage();
  const network = watchNetwork(tab);
  const resources = await watchResources(desktop, tab);
  try {
    const response = await tab.goto(url, { waitUntil: 'load', timeout: capture.navigationTimeoutMs });
    if (!response) return { failure: { reason: 'noResponse' } };
    if (response.status() >= 400) return { failure: { reason: 'http', status: response.status() } };
    if (!(response.headers()['content-type'] ?? '').includes('html')) return { failure: { reason: 'notHtml' } };
    speed = await readSpeed(tab).catch(() => null);
    // Scroll down step by step so lazy images load (they count in the data and appear in the screenshot).
    await scrollThrough(tab, capture.maxPageHeight);
    dom = await extractPage(tab);
    await scrollToTop(tab);
    desktopShot = await screenshot(tab, capture);
    // After the screenshot: injecting axe must not change what the visitor sees in it.
    accessibility = await runAxe(tab);
    await testConsentCheckboxes(tab, dom);
  } catch (error) {
    return { failure: navigationFailure(error) };
  } finally {
    await tab.close();
  }

  // An https page loading http:// files: browsers block them or show "not secure".
  network.mixedContent = dom.url.startsWith('https:')
    ? [...new Set([...network.mixedContent, ...network.requests.filter((request) => request.startsWith('http://'))])]
    : [];
  const loaded = [...resources.values()];
  const metrics = speed && {
    ...speed,
    bytes: loaded.reduce((total, resource) => total + resource.bytes, 0),
    requests: loaded.length,
  };
  const page: PageData = { ...dom, ...network, resources: loaded, metrics, accessibility };

  // A failure at phone size shouldn't discard what was found at desktop size.
  let mobileData: MobileData | null = null;
  let mobileShot: Buffer | null = null;
  const phone = await mobile.newPage();
  try {
    await phone.goto(page.url, { waitUntil: 'load', timeout: capture.navigationTimeoutMs });
    mobileData = await extractMobile(phone);
    // The whole page, top to bottom, so it can be scrolled through like on a real phone.
    await scrollThrough(phone, capture.maxPageHeight);
    await scrollToTop(phone);
    mobileShot = await screenshot(phone, capture);
  } catch {
    mobileData = null;
  } finally {
    await phone.close();
  }

  return { page, mobileData, screenshots: { desktop: desktopShot, mobile: mobileShot } };
}

/**
 * Tries to tick each personal-data consent checkbox like a visitor would: on the box, or on its
 * label when the real box is hidden behind a custom design. Records whether the tick took.
 */
async function testConsentCheckboxes(tab: Page, dom: DomData): Promise<void> {
  for (const box of dom.forms.flatMap((form) => form.checkboxes).filter((box) => RU_CONSENT.test(box.label))) {
    const element = tab.locator(`[data-site-ready-checkbox="${box.id}"]`);
    try {
      const before = await element.isChecked({ timeout: 1000 });
      try {
        await element.click({ timeout: 1500 });
      } catch {
        const label = await element.evaluateHandle((el) => (el as HTMLInputElement).labels?.[0] ?? el.closest('label'));
        await label.asElement()?.click({ timeout: 1500 });
      }
      box.clickable = (await element.isChecked({ timeout: 1000 })) !== before;
    } catch {
      box.clickable = false;
    }
  }
}

/** Collects what happens on the network and in the console while the page loads. */
function watchNetwork(tab: Page): Omit<NetworkData, 'resources' | 'metrics'> {
  const network: Omit<NetworkData, 'resources' | 'metrics'> = { requests: [], failedResources: [], jsErrors: [], mixedContent: [] };
  tab.on('request', (request) => {
    if (network.requests.length < MAX_REQUESTS_PER_PAGE && isHttpUrl(request.url())) network.requests.push(request.url());
  });
  tab.on('requestfailed', (request) => {
    const error = request.failure()?.errorText ?? 'failed';
    // ERR_ABORTED is the browser cancelling a request itself (navigation, media preload): not a site problem.
    if (request.isNavigationRequest() || error.includes('ERR_ABORTED') || !isHttpUrl(request.url())) return;
    network.failedResources.push(`${error} ${request.url()}`);
  });
  tab.on('response', (response) => {
    if (response.status() >= 400 && !response.request().isNavigationRequest()) {
      network.failedResources.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  tab.on('pageerror', (error) => network.jsErrors.push(error.message.split('\n')[0]!));
  tab.on('console', (message) => {
    // "Mixed Content: The page at 'https://…' was loaded over HTTPS, but requested an insecure script 'http://…'."
    if (message.type() === 'error' && /Mixed Content/i.test(message.text())) {
      network.mixedContent.push(...[...message.text().matchAll(/'(http:\/\/[^']+)'/g)].map((match) => match[1]!));
    }
  });
  return network;
}

/** A light full-page JPEG in CSS pixels (phone shots stay 375px wide), up to maxPageHeight. */
async function screenshot(tab: Page, { maxPageHeight, jpegQuality }: CaptureSettings): Promise<Buffer | null> {
  try {
    const height = await tab.evaluate(() => document.documentElement.scrollHeight);
    const width = tab.viewportSize()?.width ?? 375;
    return await tab.screenshot({
      type: 'jpeg',
      quality: jpegQuality,
      scale: 'css',
      fullPage: true,
      clip: height > maxPageHeight ? { x: 0, y: 0, width, height: maxPageHeight } : undefined,
      timeout: 20_000,
    });
  } catch {
    return null;
  }
}

/**
 * Records every file the page downloads, with its real transferred size and headers, through the
 * browser's DevTools protocol. The cache is disabled so each page is measured as on a first visit.
 * The map fills in while the page loads.
 */
async function watchResources(context: BrowserContext, tab: Page): Promise<Map<string, LoadedResource>> {
  const resources = new Map<string, LoadedResource>();
  try {
    const cdp = await context.newCDPSession(tab);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    cdp.on('Network.responseReceived', ({ requestId, type, response }) => {
      if (!isHttpUrl(response.url)) return;
      const header = (name: string) =>
        Object.entries(response.headers).find(([key]) => key.toLowerCase() === name)?.[1]?.toString() ?? '';
      resources.set(requestId, {
        url: response.url,
        type,
        mimeType: response.mimeType,
        status: response.status,
        bytes: Math.round(response.encodedDataLength),
        encoding: header('content-encoding'),
        cacheControl: header('cache-control'),
        expires: header('expires'),
        fromCache: Boolean(response.fromDiskCache || response.fromServiceWorker || response.fromPrefetchCache),
      });
    });
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      const resource = resources.get(requestId);
      if (resource) resource.bytes = Math.round(encodedDataLength);
    });
  } catch {
    // Without the DevTools protocol the speed checks simply have no file list.
  }
  return resources;
}

/** Absolute http(s) URL without the #fragment, or null for mailto:, tel:, javascript: etc. */
export function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function addRef(refs: Map<string, Set<string>>, url: string, pageUrl: string): void {
  const pages = refs.get(url) ?? new Set<string>();
  pages.add(pageUrl);
  refs.set(url, pages);
}

function limit<T>(items: T[], max: number, code: ScanWarning['code'], warnings: ScanWarning[]): T[] {
  if (items.length <= max) return items;
  warnings.push({ code, max, count: items.length });
  return items.slice(0, max);
}

/** Maps Playwright navigation errors ("net::ERR_NAME_NOT_RESOLVED", "Timeout 30000ms exceeded") to reasons. */
function navigationFailure(error: unknown): Failure {
  const message = error instanceof Error ? error.message.split('\n')[0]! : String(error);
  const timeout = /Timeout (\d+)ms exceeded/i.exec(message);
  if (timeout) return { reason: 'timeout', seconds: Number(timeout[1]) / 1000 };
  if (/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/.test(message)) return { reason: 'dns' };
  if (/ERR_CONNECTION_REFUSED/.test(message)) return { reason: 'refused' };
  if (/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(message)) return { reason: 'reset' };
  if (/ERR_CERT_DATE_INVALID/.test(message)) return { reason: 'certExpired' };
  if (/ERR_CERT_/.test(message)) return { reason: 'certInvalid' };
  if (/ERR_BLOCKED_BY_CLIENT/.test(message)) return { reason: 'blocked' };
  return { reason: 'other', message };
}
