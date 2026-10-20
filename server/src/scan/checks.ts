// Pure rules that turn extracted page data and HTTP results into issues.
// No browser or network here, so every rule is easy to unit-test.
// Issues carry a code and concrete values only; the client writes the sentences in the user's language.

import type { IssueCode, IssueParams, Severity } from '@qa/shared';
import type { IssueDraft, MobileData, PageData, UrlCheckResult } from './types.ts';

const TITLE_MIN = 10;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;
const HEAVY_IMAGE_BYTES = 500 * 1024;
/** An image is "oversized" when the file is this many times wider than it is displayed. */
const OVERSIZE_RATIO = 2.5;
const OVERSIZE_MIN_WIDTH = 1000;
/** A link that works but takes longer than this to answer is reported as slow. */
const SLOW_LINK_MS = 10_000;

function issue(code: IssueCode, severity: Severity, pageUrl: string, params: IssueParams = {}): IssueDraft {
  const category = code.slice(0, code.indexOf('.')) as IssueDraft['category'];
  return { code, category, severity, pageUrl, params };
}

export function checkSeo(page: PageData): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const add = (code: IssueCode, severity: Severity, params?: IssueParams) =>
    issues.push(issue(code, severity, page.url, params));

  if (!page.title) {
    add('seo.titleMissing', 'critical', { min: TITLE_MIN, max: TITLE_MAX });
  } else if (page.title.length < TITLE_MIN) {
    add('seo.titleTooShort', 'warning', { title: page.title, count: page.title.length, min: TITLE_MIN });
  } else if (page.title.length > TITLE_MAX) {
    add('seo.titleTooLong', 'warning', { title: page.title, count: page.title.length, max: TITLE_MAX });
  }

  if (!page.metaDescription) {
    add('seo.descriptionMissing', 'warning', { min: DESCRIPTION_MIN, max: DESCRIPTION_MAX });
  } else if (
    page.metaDescription.length < DESCRIPTION_MIN ||
    page.metaDescription.length > DESCRIPTION_MAX
  ) {
    add('seo.descriptionLength', 'info', {
      count: page.metaDescription.length,
      min: DESCRIPTION_MIN,
      max: DESCRIPTION_MAX,
    });
  }

  if (page.h1Count === 0) add('seo.h1Missing', 'warning');
  else if (page.h1Count > 1) add('seo.h1Multiple', 'info', { count: page.h1Count });

  if (!page.lang) add('seo.langMissing', 'info');

  if (page.robots && /noindex/i.test(page.robots)) add('seo.noindex', 'critical', { robots: page.robots });

  // Without these, a link shared on WhatsApp, LinkedIn or Facebook shows no title or image.
  const missingSocial = [!page.ogTitle && 'og:title', !page.ogImage && 'og:image'].filter((tag) => tag !== false);
  if (missingSocial.length > 0) add('seo.socialPreviewMissing', 'info', { tags: missingSocial });

  return issues;
}

/** Pages sharing the same title compete with each other in search results. */
export function checkDuplicateTitles(pages: PageData[]): IssueDraft[] {
  const byTitle = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.title) continue;
    byTitle.set(page.title, [...(byTitle.get(page.title) ?? []), page.url]);
  }

  return [...byTitle]
    .filter(([, urls]) => urls.length > 1)
    .map(([title, urls]) => issue('seo.titleDuplicate', 'warning', urls[0]!, { title, count: urls.length, pages: urls }));
}

export function checkImages(page: PageData): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const images = page.images.filter((image) => isHttpUrl(image.src));

  const missingAlt = unique(images.filter((image) => image.alt === null).map((image) => image.src));
  if (missingAlt.length > 0) {
    issues.push(issue('images.altMissing', 'warning', page.url, { count: missingAlt.length, images: missingAlt }));
  }

  const oversized = new Map<string, string>();
  for (const image of images) {
    if (
      image.renderedWidth > 0 &&
      image.naturalWidth >= OVERSIZE_MIN_WIDTH &&
      image.naturalWidth > image.renderedWidth * OVERSIZE_RATIO &&
      !oversized.has(image.src)
    ) {
      // "file width → displayed width" reads the same in every language.
      oversized.set(image.src, `${image.src} (${image.naturalWidth}px → ${image.renderedWidth}px)`);
    }
  }
  if (oversized.size > 0) {
    issues.push(issue('images.oversized', 'info', page.url, { count: oversized.size, images: [...oversized.values()] }));
  }

  return issues;
}

export function checkMobile(page: PageData, mobile: MobileData | null): IssueDraft[] {
  const issues: IssueDraft[] = [];

  if (!page.hasViewportMeta) issues.push(issue('mobile.viewportMissing', 'critical', page.url));

  if (mobile && mobile.scrollWidth > mobile.viewportWidth + 1) {
    issues.push(
      issue('mobile.horizontalScroll', 'warning', page.url, {
        viewportWidth: mobile.viewportWidth,
        scrollWidth: mobile.scrollWidth,
        elements: mobile.overflowing,
      }),
    );
  }

  return issues;
}

/** Turns the HTTP result of a link into an issue, or null if the link is fine. */
export function classifyLink(
  url: string,
  result: UrlCheckResult,
  foundOn: string[],
  internal: boolean,
): IssueDraft | null {
  const pageUrl = foundOn[0] ?? url;
  const params = { url, status: result.status, internal, foundOn };

  if (result.status === null) {
    return issue('links.unreachable', internal ? 'critical' : 'warning', pageUrl, { ...params, ...result.failure });
  }

  const status = result.status;
  if (status < 400) {
    // Works, but a visitor would probably give up before it loads.
    return result.elapsedMs > SLOW_LINK_MS
      ? issue('links.slowResponse', 'warning', pageUrl, { ...params, seconds: Math.round(result.elapsedMs / 1000) })
      : null;
  }

  if (status === 404 || status === 410) {
    return issue(internal ? 'links.notFoundInternal' : 'links.notFoundExternal', 'critical', pageUrl, params);
  }
  // Many external sites refuse automated requests: the link may well work in a browser.
  if (!internal && [401, 403, 429, 999].includes(status)) return issue('links.blocked', 'info', pageUrl, params);
  if (status >= 500) {
    return internal
      ? issue('links.serverErrorInternal', 'critical', pageUrl, params)
      : issue('links.serverErrorExternal', 'warning', pageUrl, params);
  }
  return issue('links.httpError', 'warning', pageUrl, params);
}

/** Broken and overly heavy image files. */
export function classifyImage(url: string, result: UrlCheckResult, foundOn: string[]): IssueDraft[] {
  const pageUrl = foundOn[0] ?? url;

  if (result.status === null || result.status >= 400) {
    const failure = result.status === null ? result.failure : { reason: 'http' as const, status: result.status };
    return [issue('images.broken', 'critical', pageUrl, { url, foundOn, ...failure })];
  }

  if (result.contentLength !== null && result.contentLength > HEAVY_IMAGE_BYTES) {
    return [
      issue('images.heavy', 'warning', pageUrl, {
        url,
        foundOn,
        size: formatBytes(result.contentLength),
        limit: formatBytes(HEAVY_IMAGE_BYTES),
        bytes: result.contentLength,
      }),
    ];
  }

  return [];
}

export function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/** "800 KB" / "1.5 MB": unit symbols are understood in every supported language. */
function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
