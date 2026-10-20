// Checks that concern the whole site rather than one page: robots.txt, sitemap, favicon,
// how missing pages are answered, HTTPS and the SSL certificate.

import { randomUUID } from 'node:crypto';
import { connect } from 'node:tls';
import type { IssueCode, IssueParams, Severity } from '@qa/shared';
import { isDevHost } from './handover-checks.ts';
import type { IssueDraft, PageData } from './types.ts';

const TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; SiteReady/0.1)';
/** Warn when the certificate expires within this many days. */
const CERT_WARNING_DAYS = 30;

function issue(code: IssueCode, severity: Severity, pageUrl: string, params: IssueParams = {}): IssueDraft {
  const category = code.slice(0, code.indexOf('.')) as IssueDraft['category'];
  return { code, category, severity, pageUrl, params };
}

export interface RobotsInfo {
  /** "User-agent: *" has "Disallow: /": search engines may not crawl anything. */
  blocksAll: boolean;
  sitemaps: string[];
}

export function parseRobots(text: string): RobotsInfo {
  let agents: string[] = [];
  let lastWasAgent = false;
  let blocksAll = false;
  const sitemaps: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      // Consecutive User-agent lines share the rules that follow them.
      agents = lastWasAgent ? [...agents, value] : [value];
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === 'disallow' && value === '/' && agents.includes('*')) blocksAll = true;
    if (field === 'sitemap' && value) sitemaps.push(value);
  }
  return { blocksAll, sitemaps };
}

export async function checkSite(origin: string, home: PageData): Promise<IssueDraft[]> {
  const { hostname, protocol } = new URL(origin);
  const results = await Promise.all([
    checkRobotsAndSitemap(origin, home.url),
    checkFavicon(origin, home),
    checkMissingPage(origin, home.url),
    // A local or test copy of the site isn't expected to have HTTPS.
    isDevHost(hostname) ? [] : checkHttps(origin, protocol, hostname, home.url),
  ]);
  return results.flat();
}

async function checkRobotsAndSitemap(origin: string, homeUrl: string): Promise<IssueDraft[]> {
  const issues: IssueDraft[] = [];
  const robotsUrl = `${origin}/robots.txt`;
  const robots = await get(robotsUrl);
  let sitemaps: string[] = [];

  if (robots?.ok && !(robots.contentType ?? '').includes('html')) {
    const info = parseRobots(robots.body);
    sitemaps = info.sitemaps;
    if (info.blocksAll) issues.push(issue('seo.robotsBlocksAll', 'critical', homeUrl, { url: robotsUrl }));
  } else if (robots && robots.status === 404) {
    issues.push(issue('seo.robotsMissing', 'info', homeUrl, { url: robotsUrl }));
  }

  const candidates = sitemaps.length > 0 ? sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  let found = false;
  for (const url of candidates) {
    const response = await get(url);
    if (response?.ok && /<(urlset|sitemapindex)/i.test(response.body)) {
      found = true;
      break;
    }
  }
  if (!found) issues.push(issue('seo.sitemapMissing', 'warning', homeUrl));
  return issues;
}

async function checkFavicon(origin: string, home: PageData): Promise<IssueDraft[]> {
  if (home.hasFaviconLink) return [];
  const response = await get(`${origin}/favicon.ico`);
  return response?.ok ? [] : [issue('seo.faviconMissing', 'warning', home.url)];
}

/**
 * Opens an address that can't exist. It must answer 404 (otherwise search engines index error
 * pages), and with a page of the site — menu, link home — rather than the bare server page.
 */
async function checkMissingPage(origin: string, homeUrl: string): Promise<IssueDraft[]> {
  const url = `${origin}/qa-check-${randomUUID().slice(0, 8)}`;
  const response = await get(url);
  if (response?.status === 200) return [issue('seo.soft404', 'warning', homeUrl, { url })];
  if ((response?.status === 404 || response?.status === 410) && !isSiteErrorPage(response.body)) {
    return [issue('technical.default404Page', 'warning', homeUrl, { url })];
  }
  return [];
}

/**
 * A designed error page leads the visitor back into the site: it has at least two links (menu,
 * home, search…). Default server pages ("404 Not Found — nginx") have none.
 */
export function isSiteErrorPage(html: string): boolean {
  const links = html.match(/<a\s[^>]*href\s*=/gi) ?? [];
  return links.length >= 2;
}

async function checkHttps(origin: string, protocol: string, hostname: string, homeUrl: string): Promise<IssueDraft[]> {
  if (protocol === 'http:') return [issue('technical.noHttps', 'critical', homeUrl, { url: origin })];
  const issues: IssueDraft[] = [];

  // http://site must send visitors to https://site.
  const httpUrl = `http://${hostname}/`;
  try {
    const response = await fetch(httpUrl, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': USER_AGENT } });
    await response.body?.cancel();
    const location = response.headers.get('location') ?? '';
    if (response.status === 200 || (response.status >= 300 && response.status < 400 && !location.startsWith('https://'))) {
      issues.push(issue('technical.httpNotRedirected', 'warning', homeUrl, { url: httpUrl }));
    }
  } catch {
    // Port 80 closed: nobody can land on the http version, which is fine.
  }

  const validTo = await certificateExpiry(hostname);
  if (validTo) {
    const days = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
    if (days <= CERT_WARNING_DAYS) {
      issues.push(issue('technical.certExpiring', days < 7 ? 'critical' : 'warning', homeUrl, {
        count: Math.max(days, 0),
        date: validTo.toISOString().slice(0, 10),
      }));
    }
  }
  return issues;
}

function certificateExpiry(hostname: string): Promise<Date | null> {
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: TIMEOUT_MS }, () => {
      const validTo = socket.getPeerCertificate()?.valid_to;
      socket.end();
      resolve(validTo ? new Date(validTo) : null);
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

interface TextResponse {
  ok: boolean;
  status: number;
  contentType: string | null;
  body: string;
}

async function get(url: string): Promise<TextResponse | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': USER_AGENT } });
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      // Sitemaps can be huge: the first 200 KB are plenty to recognize one.
      body: (await response.text()).slice(0, 200_000),
    };
  } catch {
    return null;
  }
}
