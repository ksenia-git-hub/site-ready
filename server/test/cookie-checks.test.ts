import { describe, expect, it } from 'vitest';
import { checkCookiesBeforeConsent, classifyCookie } from '../src/scan/cookie-checks.ts';

describe('classifyCookie', () => {
  it('recognizes the cookies of common tracking tools', () => {
    expect(classifyCookie({ name: '_ga', domain: '.site.it' })).toBe('Google Analytics');
    expect(classifyCookie({ name: '_ga_ABC123', domain: '.site.it' })).toBe('Google Analytics');
    expect(classifyCookie({ name: '_fbp', domain: '.site.it' })).toBe('Meta Pixel');
    expect(classifyCookie({ name: '_ym_uid', domain: '.site.ru' })).toBe('Yandex Metrica');
    expect(classifyCookie({ name: '_hjSessionUser_123', domain: 'site.it' })).toBe('Hotjar');
  });

  it('leaves technical cookies alone', () => {
    for (const name of ['PHPSESSID', 'wordpress_logged_in_x', 'cart', 'lingua', 'cookie_consent', 'cf_clearance']) {
      expect(classifyCookie({ name, domain: 'site.it' })).toBeNull();
    }
  });

  it('only counts generic names on the service that owns them', () => {
    expect(classifyCookie({ name: 'YSC', domain: '.youtube.com' })).toBe('YouTube');
    expect(classifyCookie({ name: 'YSC', domain: 'site.it' })).toBeNull();
  });
});

describe('checkCookiesBeforeConsent', () => {
  it('reports tracking cookies with their service, once each', () => {
    const issues = checkCookiesBeforeConsent(
      [
        { name: '_ga', domain: '.site.it' },
        { name: '_ga', domain: '.site.it' },
        { name: '_fbp', domain: '.site.it' },
        { name: 'PHPSESSID', domain: 'site.it' },
      ],
      'https://site.it/',
    );

    expect(issues).toEqual([
      {
        code: 'legal.cookiesBeforeConsent',
        category: 'legal',
        severity: 'critical',
        pageUrl: 'https://site.it/',
        params: {
          count: 2,
          trackers: ['Google Analytics', 'Meta Pixel'],
          cookies: ['_ga — Google Analytics (site.it)', '_fbp — Meta Pixel (site.it)'],
        },
      },
    ]);
  });

  it('finds nothing when only technical cookies are set', () => {
    expect(checkCookiesBeforeConsent([{ name: 'PHPSESSID', domain: 'site.it' }], 'https://site.it/')).toEqual([]);
  });
});
