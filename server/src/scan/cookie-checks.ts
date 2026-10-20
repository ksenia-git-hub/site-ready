// Tracking cookies set before consent. The scanner never clicks "Accept" on a cookie banner,
// so every cookie found at the end of the crawl was set without the visitor's consent.

import type { IssueDraft } from './types.ts';

export interface BrowserCookie {
  name: string;
  domain: string;
}

/**
 * Cookies of well-known analytics and advertising tools. Technical cookies (session, cart,
 * language, the consent choice itself) don't need consent and are deliberately not listed.
 */
const TRACKING_COOKIES: { service: string; name: RegExp; domain?: RegExp }[] = [
  { service: 'Google Analytics', name: /^(_ga|_ga_.+|_gid|_gat.*|__utm[abcz])$/ },
  { service: 'Google Ads', name: /^(_gcl_.+|IDE|test_cookie|__gads|__gpi)$/ },
  { service: 'Meta Pixel', name: /^(_fbp|_fbc|fr)$/ },
  { service: 'Hotjar', name: /^_hj.+$/ },
  { service: 'Microsoft Clarity', name: /^(_clck|_clsk|CLID)$/ },
  { service: 'Microsoft Ads', name: /^(_uetsid|_uetvid|MUID)$/ },
  { service: 'LinkedIn Insight', name: /^(li_sugr|bcookie|lidc|UserMatchHistory|AnalyticsSyncHistory|li_fat_id)$/ },
  { service: 'TikTok Pixel', name: /^(_ttp|_tt_enable_cookie|ttwid)$/ },
  { service: 'Yandex Metrica', name: /^(_ym_.+|yandexuid|yuidss|ymex)$/ },
  { service: 'Matomo', name: /^(_pk_id.*|_pk_ses.*)$/ },
  { service: 'HubSpot', name: /^(__hstc|__hssc|hubspotutk)$/ },
  // YouTube embeds set these unless the privacy-enhanced youtube-nocookie.com is used.
  { service: 'YouTube', name: /^(VISITOR_INFO1_LIVE|YSC|VISITOR_PRIVACY_METADATA)$/, domain: /youtube\.com$/ },
  { service: 'X (Twitter)', name: /^(personalization_id|guest_id.*)$/, domain: /(twitter|x)\.com$/ },
];

export function classifyCookie(cookie: BrowserCookie): string | null {
  const domain = cookie.domain.replace(/^\./, '');
  const match = TRACKING_COOKIES.find((entry) => entry.name.test(cookie.name) && (!entry.domain || entry.domain.test(domain)));
  return match?.service ?? null;
}

export function checkCookiesBeforeConsent(cookies: BrowserCookie[], homeUrl: string): IssueDraft[] {
  const found = new Map<string, string>();
  const services = new Set<string>();
  for (const cookie of cookies) {
    const service = classifyCookie(cookie);
    if (!service) continue;
    services.add(service);
    found.set(`${cookie.name}@${cookie.domain}`, `${cookie.name} — ${service} (${cookie.domain.replace(/^\./, '')})`);
  }
  if (found.size === 0) return [];

  return [
    {
      code: 'legal.cookiesBeforeConsent',
      category: 'legal',
      severity: 'critical',
      pageUrl: homeUrl,
      params: { count: found.size, trackers: [...services], cookies: [...found.values()] },
    },
  ];
}
