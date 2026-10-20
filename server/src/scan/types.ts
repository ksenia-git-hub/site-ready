import type { Failure, Issue, PageMetrics, ScanProgress, ScanReport } from '@qa/shared';

export interface ScanOptions {
  maxPages: number;
  /** Aborted when the user stops the scan: the scanner closes the browser and gives up quickly. */
  signal?: AbortSignal;
}

export type ProgressFn = (progress: ScanProgress) => void;

/** Thrown by the scanner when it was stopped through ScanOptions.signal. */
export class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled');
    this.name = 'ScanCancelledError';
  }
}

/** Thrown by the scanner when the start page can't be analyzed; becomes ScanJobView.error. */
export class ScanError extends Error {
  readonly url: string;
  readonly failure: Failure;

  constructor(url: string, failure: Failure) {
    super(`Cannot open ${url}: ${failure.reason}${failure.status ? ` ${failure.status}` : ''}${failure.message ? ` (${failure.message})` : ''}`);
    this.name = 'ScanError';
    this.url = url;
    this.failure = failure;
  }
}

/** JPEG screenshots of one page, as displayed on a desktop monitor and on a phone. */
export interface PageScreenshots {
  desktop: Buffer | null;
  mobile: Buffer | null;
}

export interface ScanResult {
  report: ScanReport;
  /** One entry per report.pages item, same order. Kept out of the report to keep its JSON small. */
  screenshots: PageScreenshots[];
}

/** Runs a full scan of a site. Injected into the app so tests can replace it with a fake. */
export type Scanner = (url: string, options: ScanOptions, onProgress: ProgressFn) => Promise<ScanResult>;

/** An issue before it gets its final id in the report. */
export type IssueDraft = Omit<Issue, 'id'>;

/** What is read from the DOM of a page rendered at desktop size (see extract.ts). */
export interface DomData {
  /** Final URL after redirects. */
  url: string;
  title: string | null;
  metaDescription: string | null;
  robots: string | null;
  lang: string | null;
  h1Count: number;
  hasViewportMeta: boolean;
  /** Absolute URLs of all <a href> on the page. */
  links: string[];
  images: ImageData[];
  ogTitle: string | null;
  ogImage: string | null;
  /** A <link rel="icon"> is declared (/favicon.ico is checked separately). */
  hasFaviconLink: boolean;
  /** Visible text of the page (capped), for leftover placeholder content. */
  text: string;
  /** A cookie consent banner or a known consent platform (iubenda, Cookiebot...) was found. */
  hasConsentBanner: boolean;
  /** Analytics/ads scripts detected from their globals (gtag, fbq, ym...). */
  trackers: string[];
  /** Links whose text says nothing out of context ("clicca qui", "read more"), as "text → url". */
  genericLinks: string[];
  /** Forms that ask for personal data (e-mail, phone, name), without login and search forms. */
  forms: PageForm[];
  /** Menu, button and heading texts with Latin letters only (for the Russian language law). */
  foreignUiTexts: string[];
  /** Share of Cyrillic among the letters of the page text, from 0 to 1. */
  cyrillicShare: number;
}

export interface FormCheckbox {
  /** Marker set on the element (data-site-ready-checkbox) to find it again in the page. */
  id: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  /** Whether a visitor can tick it (tested in the browser for consent boxes); null if not tested. */
  clickable: boolean | null;
}

export interface PageForm {
  /** The form's action attribute, "" if none. */
  action: string;
  /** Names (or types) of the fields that collect personal data. */
  personalFields: string[];
  checkboxes: FormCheckbox[];
  /** Visible text of the form (labels, notes under the button…). */
  text: string;
}

/** What the browser saw on the network and in the console while loading the page. */
export interface NetworkData {
  /** Every URL the page requested (scripts, styles, fonts, images...). */
  requests: string[];
  /** Sub-resources that failed, as "HTTP 404 https://…" or "net::ERR_… https://…". */
  failedResources: string[];
  /** Uncaught JavaScript errors. */
  jsErrors: string[];
  /** http:// resources requested by an https:// page. */
  mixedContent: string[];
  /** Every file downloaded for the page (from the browser's DevTools protocol), for the speed checks. */
  resources: LoadedResource[];
  /** Loading speed, or null if it couldn't be measured. */
  metrics: PageMetrics | null;
}

export interface LoadedResource {
  url: string;
  /** DevTools resource type: Document, Script, Stylesheet, Image, Font, XHR, Fetch... */
  type: string;
  mimeType: string;
  status: number;
  /** Bytes transferred over the network (compressed size, headers included). */
  bytes: number;
  /** Content-Encoding header (gzip, br, zstd…), "" if not compressed. */
  encoding: string;
  /** Cache-Control and Expires headers, "" if absent. */
  cacheControl: string;
  expires: string;
  /** Served from the browser cache or a service worker: not a network download. */
  fromCache: boolean;
}

/** One failed axe-core rule on a page. */
export interface AxeViolation {
  /** axe rule id, e.g. "color-contrast". */
  id: string;
  /** axe impact: critical, serious, moderate or minor. */
  impact: string;
  /** axe's English one-line summary and guide URL, used for rules we have no texts for. */
  help: string;
  helpUrl: string;
  /** Up to 20 offending elements as HTML snippets (with the contrast ratio when relevant). */
  nodes: string[];
  /** How many elements fail in total. */
  total: number;
}

export type PageData = DomData & NetworkData & { accessibility: AxeViolation[] };

export interface ImageData {
  src: string;
  /** null when the alt attribute is missing entirely (alt="" is valid for decorative images). */
  alt: string | null;
  /** Width in CSS pixels as displayed on the page (0 if hidden). */
  renderedWidth: number;
  /** Width of the actual file in pixels (0 if not loaded). */
  naturalWidth: number;
}

/** What is measured on a page rendered at phone size. */
export interface MobileData {
  viewportWidth: number;
  scrollWidth: number;
  /** Short CSS-like descriptions of the elements that stick out to the right. */
  overflowing: string[];
}

export interface UrlCheckResult {
  /** HTTP status after redirects, or null if the request failed. */
  status: number | null;
  contentLength: number | null;
  contentType: string | null;
  /** Why the request failed, when status is null. */
  failure: Failure | null;
  /** How long the answer took, in milliseconds. */
  elapsedMs: number;
}
