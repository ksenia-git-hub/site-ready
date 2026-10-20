// Pure rules for the problems typical of a site handover: JavaScript errors, leftovers from
// development (lorem ipsum, links to staging), and the legal basics (privacy, cookies, VAT number).

import type { IssueCode, IssueParams, Severity } from '@qa/shared';
import type { IssueDraft, PageData } from './types.ts';

/** How many examples to keep per issue (the client shows 5 and "…and N more"). */
const MAX_EXAMPLES = 20;
/** Characters of context kept around a match in the page text. */
const SNIPPET_RADIUS = 40;

function issue(code: IssueCode, severity: Severity, pageUrl: string, params: IssueParams = {}): IssueDraft {
  const category = code.slice(0, code.indexOf('.')) as IssueDraft['category'];
  return { code, category, severity, pageUrl, params };
}

/** Hosts that only exist on a developer's machine or on a test server. */
export function isDevHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    /^127\./.test(host) ||
    /^(10|192\.168)\./.test(host) ||
    /\.(local|localhost|test|invalid)$/.test(host) ||
    /^(staging|stage|dev|develop|test|preview|demo)[.-]/.test(host)
  );
}

export function checkTechnical(page: PageData): IssueDraft[] {
  const issues: IssueDraft[] = [];

  if (page.jsErrors.length > 0) {
    issues.push(issue('technical.jsErrors', 'warning', page.url, { errors: unique(page.jsErrors).slice(0, MAX_EXAMPLES) }));
  }

  // Images in <img> already have their own check; here go scripts, styles, fonts and CSS backgrounds.
  const imageUrls = new Set(page.images.map((image) => image.src));
  const failed = unique(page.failedResources).filter((entry) => !imageUrls.has(entry.slice(entry.lastIndexOf(' ') + 1)));
  if (failed.length > 0) {
    issues.push(issue('technical.failedResources', 'warning', page.url, { resources: failed.slice(0, MAX_EXAMPLES) }));
  }

  if (page.mixedContent.length > 0) {
    issues.push(issue('technical.mixedContent', 'warning', page.url, { resources: unique(page.mixedContent).slice(0, MAX_EXAMPLES) }));
  }

  return issues;
}

const PLACEHOLDER_TEXT = /lorem ipsum|dolor sit amet|consectetur adipiscing/gi;
/** Default content of fresh WordPress / Joomla installs, in the languages we support. */
const DEFAULT_CMS_TEXT =
  /hello world!|sample page|just another wordpress site|ciao mondo!|pagina d[i']\s?esempio|un altro sito wordpress|привет, мир!|пример страницы|ещё один сайт на wordpress/gi;
const TODO_TEXT = /\b(TODO|FIXME)\b/g;
/**
 * Demo e-mail domains and dummy phone numbers. The digit look-arounds keep real numbers that merely
 * contain "123456789" (e.g. the VAT number 01234567890) from matching.
 */
const PLACEHOLDER_CONTACT =
  /[\w.+-]+@(example\.(com|org|net|it)|test\.com|domain\.com|yourdomain\.\w+|tuodominio\.\w+|dominio\.it)|(?<!\d)(\+\d{1,3}[\s.-]?)?(000[\s.-]?000[\s.-]?0{3,4}|123[\s.-]?456[\s.-]?789\d?)(?!\d)/gi;

export function checkContent(page: PageData, siteHost: string): IssueDraft[] {
  const issues: IssueDraft[] = [];

  const placeholder = snippets(page.text, PLACEHOLDER_TEXT);
  if (placeholder.length > 0) issues.push(issue('content.placeholderText', 'critical', page.url, { snippets: placeholder }));

  // Links and loaded files pointing to a developer machine or a staging server.
  const devUrls = unique([...page.links, ...page.requests, ...page.images.map((image) => image.src)]).filter((url) => {
    try {
      const { hostname, protocol } = new URL(url);
      return (protocol === 'http:' || protocol === 'https:') && hostname !== siteHost && isDevHost(hostname);
    } catch {
      return false;
    }
  });
  if (devUrls.length > 0) issues.push(issue('content.devLinks', 'critical', page.url, { urls: devUrls.slice(0, MAX_EXAMPLES) }));

  const cms = snippets(page.text, DEFAULT_CMS_TEXT);
  if (cms.length > 0) issues.push(issue('content.defaultCmsText', 'warning', page.url, { snippets: cms }));

  const contacts = unique([
    ...matches(page.text, PLACEHOLDER_CONTACT),
    ...page.links.filter((link) => link.startsWith('mailto:') || link.startsWith('tel:')).flatMap((link) => matches(link, PLACEHOLDER_CONTACT)),
  ]);
  if (contacts.length > 0) issues.push(issue('content.placeholderContact', 'warning', page.url, { items: contacts.slice(0, MAX_EXAMPLES) }));

  const todos = snippets(page.text, TODO_TEXT);
  if (todos.length > 0) issues.push(issue('content.todoText', 'warning', page.url, { snippets: todos }));

  return issues;
}

const PRIVACY = /privacy|informativa|datenschutz|конфиденциальн|персональных данных/i;
const COOKIE_POLICY = /cookie/i;
/** "P.IVA 01234567890", "Partita IVA: IT01234567890", "VAT IT01234567890". */
const VAT_NUMBER = /(p\.?\s?iva|partita\s+iva|vat|c\.?f\.?\s*\/\s*p\.?\s?iva)\D{0,25}\d{11}/i;

/**
 * Site-wide legal basics, judged on all analyzed pages together (footer links count wherever they are).
 * The VAT number is only required for Italian sites.
 */
export function checkLegal(pages: PageData[], startUrl: string): IssueDraft[] {
  if (pages.length === 0) return [];
  const issues: IssueDraft[] = [];
  const home = pages[0]!;
  const everywhere = (pattern: RegExp) =>
    pages.some((page) => page.links.some((link) => pattern.test(link)) || pattern.test(page.text));

  if (!everywhere(PRIVACY)) issues.push(issue('legal.privacyMissing', 'warning', home.url));
  if (!everywhere(COOKIE_POLICY)) issues.push(issue('legal.cookiePolicyMissing', 'warning', home.url));

  const trackers = unique(pages.flatMap((page) => page.trackers));
  if (trackers.length > 0 && !pages.some((page) => page.hasConsentBanner)) {
    issues.push(issue('legal.cookieBannerMissing', 'warning', home.url, { trackers }));
  }

  const italian = (home.lang ?? '').toLowerCase().startsWith('it') || new URL(startUrl).hostname.endsWith('.it');
  if (italian && !pages.some((page) => VAT_NUMBER.test(page.text))) issues.push(issue('legal.vatMissing', 'warning', home.url));

  if (isRussianSite(home, startUrl)) issues.push(...checkRussianLaw(pages));

  return issues;
}

/** Russian-language site or Russian domain (.ru, .su, .рф): Russian law 152-ФЗ applies. */
export function isRussianSite(home: PageData, startUrl: string): boolean {
  const host = new URL(startUrl).hostname;
  return (home.lang ?? '').toLowerCase().startsWith('ru') || /\.(ru|su|xn--p1ai)$/.test(host);
}

/**
 * "Согласен на обработку персональных данных", "даю согласие…", "вы соглашаетесь…": the word stems
 * cover every ending (согласен, согласие, соглашаюсь, соглашаетесь…).
 */
export const RU_CONSENT = /(соглас|соглаш)[\s\S]{0,120}(персональн|обработк)|(персональн|обработк)[\s\S]{0,120}(соглас|соглаш)/i;
/** A page counts as Russian when at least this share of its letters is Cyrillic. */
const RU_PAGE_MIN_CYRILLIC = 0.3;
/** Short acronyms (PDF, SEO, FAQ), e-mails, web addresses and numbers are not texts to translate; "SALE" or "Shop" are. */
const NOT_A_FOREIGN_TEXT = /^[A-Z0-9&.+-]{1,3}$|@|https?:|www\.|\.(ru|com|net|org|su)\b|^\+?\d/;
const RU_SHOP = /в корзину|корзина|оформить заказ|₽/i;
const RU_SELLER_ID = /ИНН\D{0,15}\d{10,12}|ОГРН(ИП)?\D{0,15}\d{13,15}/i;
/** Analytics and ads collected on servers abroad. Yandex Metrica stores data in Russia and is not listed. */
const FOREIGN_TRACKER_HOSTS: [RegExp, string][] = [
  [/(^|\.)google-analytics\.com$/, 'Google Analytics'],
  [/(^|\.)googletagmanager\.com$/, 'Google Tag Manager'],
  [/(^|\.)connect\.facebook\.net$/, 'Meta Pixel'],
  [/(^|\.)hotjar\.com$/, 'Hotjar'],
  [/(^|\.)clarity\.ms$/, 'Microsoft Clarity'],
  [/(^|\.)licdn\.com$/, 'LinkedIn Insight'],
  [/(^|\.)analytics\.tiktok\.com$/, 'TikTok Pixel'],
];

/**
 * Russian personal data law (152-ФЗ, as amended in 2025) and consumer law:
 * consent in every form that collects personal data (separate, not pre-ticked), no direct
 * collection by foreign services, and the seller's ИНН/ОГРН on online shops.
 */
function checkRussianLaw(pages: PageData[]): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const home = pages[0]!;

  for (const page of pages) {
    const missing: string[] = [];
    const prechecked: string[] = [];
    const noCheckbox: string[] = [];
    const notClickable: string[] = [];
    for (const form of page.forms) {
      const description = `${form.personalFields.join(', ')}${form.action ? ` → ${form.action}` : ''}`;
      const consentBox = form.checkboxes.find((box) => RU_CONSENT.test(box.label));
      if (consentBox) {
        // A box that can't be ticked means consent can never be given (or the form can't be sent).
        if (consentBox.clickable === false) notClickable.push(description);
        else if (consentBox.checked) prechecked.push(description);
      } else if (RU_CONSENT.test(form.text)) {
        noCheckbox.push(description);
      } else {
        missing.push(description);
      }
    }
    if (missing.length > 0) issues.push(issue('legal.ruConsentMissing', 'warning', page.url, { items: missing }));
    if (prechecked.length > 0) issues.push(issue('legal.ruConsentPrechecked', 'warning', page.url, { items: prechecked }));
    if (noCheckbox.length > 0) issues.push(issue('legal.ruConsentNoCheckbox', 'info', page.url, { items: noCheckbox }));
    if (notClickable.length > 0) issues.push(issue('legal.ruConsentNotClickable', 'warning', page.url, { items: notClickable }));
  }

  const foreign = unique([
    ...pages.flatMap((page) => page.trackers),
    ...pages.flatMap((page) => page.requests).flatMap((url) => {
      try {
        const host = new URL(url).hostname;
        return FOREIGN_TRACKER_HOSTS.filter(([pattern]) => pattern.test(host)).map(([, name]) => name);
      } catch {
        return [];
      }
    }),
  ]).filter((name) => name !== 'Yandex Metrica' && name !== 'Matomo');
  if (foreign.length > 0) issues.push(issue('legal.ruForeignServices', 'warning', home.url, { trackers: foreign }));

  // Law 168-ФЗ (from 1 March 2026): information for consumers must be in Russian. Only pages that are
  // mostly Russian are judged, so an English version of the site (/en/) is not reported.
  for (const page of pages) {
    if (page.cyrillicShare < RU_PAGE_MIN_CYRILLIC) continue;
    const foreign = page.foreignUiTexts.filter((text) => !NOT_A_FOREIGN_TEXT.test(text));
    if (foreign.length > 0) issues.push(issue('legal.ruForeignLanguage', 'warning', page.url, { items: foreign }));
  }

  const isShop = pages.some((page) => RU_SHOP.test(page.text));
  if (isShop && !pages.some((page) => RU_SELLER_ID.test(page.text))) {
    issues.push(issue('legal.ruSellerDetailsMissing', 'warning', home.url));
  }

  return issues;
}

/**
 * Up to MAX_EXAMPLES "…text around the match…" excerpts. Matches that fall inside the previous
 * excerpt ("lorem ipsum dolor sit amet" matches twice) and repeats of the same words are skipped.
 */
function snippets(text: string, pattern: RegExp): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  let previousEnd = -1;
  for (const match of text.matchAll(pattern)) {
    const key = match[0].toLowerCase();
    if (match.index < previousEnd || seen.has(key)) continue;
    if (found.length >= MAX_EXAMPLES) break;
    const start = Math.max(0, match.index - SNIPPET_RADIUS);
    const end = Math.min(text.length, match.index + match[0].length + SNIPPET_RADIUS);
    const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
    found.push(`${start > 0 ? '…' : ''}${excerpt}${end < text.length ? '…' : ''}`);
    seen.add(key);
    previousEnd = end;
  }
  return found;
}

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0].trim());
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
