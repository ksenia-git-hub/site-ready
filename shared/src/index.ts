// Data contract shared by the server (which produces reports) and the client (which renders them).
// The server never sends human-readable text: it sends codes plus concrete values,
// and the client turns them into sentences in the language the user picked.

export const CATEGORIES = ['links', 'images', 'seo', 'mobile', 'performance', 'technical', 'content', 'legal', 'accessibility'] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ['critical', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Every kind of problem the scanner can report. The client has a title/description/fix for each. */
export const ISSUE_CODES = [
  'links.notFoundInternal',
  'links.notFoundExternal',
  'links.unreachable',
  'links.serverErrorInternal',
  'links.serverErrorExternal',
  'links.blocked',
  'links.httpError',
  'links.slowResponse',
  'images.broken',
  'images.heavy',
  'images.altMissing',
  'images.oversized',
  'seo.titleMissing',
  'seo.titleTooShort',
  'seo.titleTooLong',
  'seo.titleDuplicate',
  'seo.descriptionMissing',
  'seo.descriptionLength',
  'seo.h1Missing',
  'seo.h1Multiple',
  'seo.langMissing',
  'seo.noindex',
  'seo.faviconMissing',
  'seo.socialPreviewMissing',
  'seo.robotsBlocksAll',
  'seo.robotsMissing',
  'seo.sitemapMissing',
  'seo.soft404',
  'mobile.viewportMissing',
  'mobile.horizontalScroll',
  'performance.slowServer',
  'performance.slowLcp',
  'performance.layoutShift',
  'performance.heavyPage',
  'performance.tooManyRequests',
  'performance.uncompressed',
  'performance.noCache',
  'performance.legacyImageFormats',
  'technical.jsErrors',
  'technical.failedResources',
  'technical.mixedContent',
  'technical.noHttps',
  'technical.httpNotRedirected',
  'technical.certExpiring',
  'technical.default404Page',
  'content.placeholderText',
  'content.devLinks',
  'content.defaultCmsText',
  'content.placeholderContact',
  'content.todoText',
  'legal.privacyMissing',
  'legal.cookiePolicyMissing',
  'legal.cookieBannerMissing',
  'legal.cookiesBeforeConsent',
  'legal.vatMissing',
  'legal.ruConsentMissing',
  'legal.ruConsentPrechecked',
  'legal.ruConsentNoCheckbox',
  'legal.ruConsentNotClickable',
  'legal.ruForeignServices',
  'legal.ruSellerDetailsMissing',
  'legal.ruForeignLanguage',
  'accessibility.colorContrast',
  'accessibility.linkName',
  'accessibility.buttonName',
  'accessibility.formLabel',
  'accessibility.selectName',
  'accessibility.inputButtonName',
  'accessibility.inputImageAlt',
  'accessibility.frameTitle',
  'accessibility.zoomDisabled',
  'accessibility.headingOrder',
  'accessibility.emptyHeading',
  'accessibility.listStructure',
  'accessibility.listItem',
  'accessibility.ariaAllowedAttr',
  'accessibility.ariaRequiredAttr',
  'accessibility.ariaValidValue',
  'accessibility.ariaHiddenFocus',
  'accessibility.nestedInteractive',
  'accessibility.svgImgAlt',
  'accessibility.roleImgAlt',
  'accessibility.positiveTabindex',
  'accessibility.autocompleteValid',
  'accessibility.scrollableRegion',
  'accessibility.linkInTextBlock',
  'accessibility.videoCaption',
  'accessibility.genericLinkText',
  'accessibility.other',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

/** Why a request or a page failed. Translated by the client. */
export const FAILURE_REASONS = [
  'timeout',
  'dns',
  'refused',
  'reset',
  'certExpired',
  'certInvalid',
  'http',
  'notHtml',
  'noResponse',
  /** The address is in an internal network: a public deployment refuses to contact it. */
  'blocked',
  'other',
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export interface Failure {
  reason: FailureReason;
  /** HTTP status, for reason "http". */
  status?: number;
  /** Timeout length, for reason "timeout". */
  seconds?: number;
  /** Original technical message, for reason "other". */
  message?: string;
}

/**
 * Values used in the texts of an issue. Arrays are shown as lists under the description
 * (e.g. foundOn = pages containing a broken link). "count" drives plural forms.
 */
export type IssueParams = Record<string, string | number | boolean | null | string[]>;

/** A single problem found by an automated check. */
export interface Issue {
  id: string;
  code: IssueCode;
  category: Category;
  severity: Severity;
  /** Page on which the problem was found. */
  pageUrl: string;
  params: IssueParams;
}

export interface ScanSummary {
  pagesScanned: number;
  linksChecked: number;
  imagesChecked: number;
  durationMs: number;
  issuesBySeverity: Record<Severity, number>;
  issuesByCategory: Record<Category, number>;
}

/** A limit that cut the scan short. */
export interface ScanWarning {
  code: 'pageLimit' | 'linkLimit' | 'imageLimit';
  /** The limit that was applied. */
  max: number;
  /** How many items were found in total (pageLimit: how many were left out). */
  count: number;
}

/**
 * Loading speed of a page, measured by the scanner's browser without network throttling
 * (on a phone over mobile data it will be slower). Times in milliseconds, sizes in bytes.
 */
export interface PageMetrics {
  /** Time to first byte: how long the server takes to start answering. */
  ttfbMs: number;
  /** Largest Contentful Paint: when the main element (big image or title) appears. null if not measured. */
  lcpMs: number | null;
  /** Cumulative Layout Shift: how much the page jumps while loading (0 = not at all). */
  cls: number;
  /** When the browser finished loading the page (load event). */
  loadMs: number;
  /** Bytes transferred while visiting the page, including lazy-loaded images. */
  bytes: number;
  requests: number;
}

/**
 * [needs improvement, poor] limits for the speed metrics, used by the server checks and by the
 * report badges. Times and CLS follow Google's Core Web Vitals.
 */
export const SPEED_THRESHOLDS = {
  ttfbMs: [800, 1800],
  lcpMs: [2500, 4000],
  cls: [0.1, 0.25],
  bytes: [3 * 1024 * 1024, 6 * 1024 * 1024],
} as const satisfies Record<string, readonly [number, number]>;

export type SpeedRating = 'good' | 'needsImprovement' | 'poor';

export function rateSpeed(metric: keyof typeof SPEED_THRESHOLDS, value: number): SpeedRating {
  const [needsImprovement, poor] = SPEED_THRESHOLDS[metric];
  if (value > poor) return 'poor';
  if (value > needsImprovement) return 'needsImprovement';
  return 'good';
}

/** A page that was opened in the browser. */
export interface PageSummary {
  /** Final URL after redirects. */
  url: string;
  title: string | null;
  /**
   * Whether desktop and phone screenshots exist. They are served separately
   * (GET /api/scans/:id/screenshots/:pageIndex/:device) to keep the report small.
   */
  screenshots: boolean;
  metrics: PageMetrics | null;
}

export const SCREENSHOT_DEVICES = ['desktop', 'mobile'] as const;
export type ScreenshotDevice = (typeof SCREENSHOT_DEVICES)[number];

export interface ScanReport {
  startUrl: string;
  /** Pages actually visited, in the order they were analyzed. */
  pages: PageSummary[];
  summary: ScanSummary;
  issues: Issue[];
  warnings: ScanWarning[];
}

/** "cancelled": the user stopped the scan (POST /api/scans/:id/cancel) before it finished. */
export type ScanStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ScanProgress {
  step: 'queued' | 'starting' | 'pages' | 'links' | 'images';
  done?: number;
  total?: number;
  /** Page being analyzed, for step "pages". */
  url?: string;
}

/** Why a whole scan failed. url is set when the start page couldn't be opened. */
export interface ScanFailure extends Failure {
  url: string | null;
}

/** What GET /api/scans/:id returns. */
export interface ScanJobView {
  id: string;
  status: ScanStatus;
  url: string;
  createdAt: string;
  progress: ScanProgress | null;
  report: ScanReport | null;
  error: ScanFailure | null;
}

export const DEFAULT_MAX_PAGES = 10;
export const MAX_PAGES_LIMIT = 50;

/** Body of POST /api/scans. */
export interface CreateScanRequest {
  /** Address of the site; "example.com" without a scheme is treated as https. */
  url: string;
  /** How many pages of the site to visit (1..MAX_PAGES_LIMIT). */
  maxPages?: number;
}

/** What POST /api/scans returns (status 202). */
export interface CreateScanResponse {
  id: string;
}

export type ApiErrorCode =
  | 'invalidUrl'
  | 'privateAddress'
  | 'scanNotFound'
  | 'notFound'
  | 'notCancellable'
  | 'unauthorized'
  | 'wrongPassword'
  | 'tooManyAttempts'
  | 'tooManyScans';

/** What GET /api/session returns: whether a password is needed and whether this browser is logged in. */
export interface SessionResponse {
  authRequired: boolean;
  authenticated: boolean;
}

/** Body of POST /api/login. */
export interface LoginRequest {
  password: string;
}

/**
 * Error body returned by the API for 4xx/5xx responses. Our own errors use an ApiErrorCode;
 * Fastify's built-in ones (e.g. validation) carry codes like "FST_ERR_VALIDATION" and an English message.
 */
export interface ApiError {
  code?: ApiErrorCode | (string & {});
  message?: string;
}

export interface HealthResponse {
  status: 'ok';
}
