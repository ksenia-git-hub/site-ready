import { describe, expect, it } from 'vitest';
import { checkContent, checkLegal, checkTechnical, isDevHost } from '../src/scan/handover-checks.ts';
import { isSiteErrorPage, parseRobots } from '../src/scan/site-checks.ts';
import type { IssueDraft } from '../src/scan/types.ts';
import { goodPage } from './fixtures.ts';

const codes = (issues: IssueDraft[]) => issues.map((issue) => `${issue.severity}: ${issue.code}`);

/** Footer of a well-made Italian site: privacy, cookies and VAT number. */
const LEGAL_FOOTER = 'Studio Rossi srl – P.IVA 01234567890 – Privacy policy – Cookie policy';

describe('checkTechnical', () => {
  it('finds nothing on a clean page', () => {
    expect(checkTechnical(goodPage)).toEqual([]);
  });

  it('reports JS errors, failed files and mixed content', () => {
    const issues = checkTechnical({
      ...goodPage,
      jsErrors: ['Uncaught TypeError: x is undefined', 'Uncaught TypeError: x is undefined'],
      failedResources: ['HTTP 404 https://site.it/js/app.js', 'HTTP 404 https://site.it/a.jpg'],
      mixedContent: ['http://cdn.site.it/font.woff2'],
    });

    expect(codes(issues)).toEqual(['warning: technical.jsErrors', 'warning: technical.failedResources', 'warning: technical.mixedContent']);
    expect(issues[0]?.params.errors).toEqual(['Uncaught TypeError: x is undefined']);
    // The broken <img> is already reported by the image check.
    expect(issues[1]?.params.resources).toEqual(['HTTP 404 https://site.it/js/app.js']);
  });
});

describe('checkContent', () => {
  it('finds nothing on a clean page', () => {
    expect(checkContent({ ...goodPage, text: LEGAL_FOOTER }, 'site.it')).toEqual([]);
  });

  it('finds leftovers from development', () => {
    const issues = checkContent(
      {
        ...goodPage,
        text: 'Benvenuti! Lorem ipsum dolor sit amet. Hello world! Scrivici a info@example.com. TODO: foto team',
        links: ['https://staging.site.it/contatti', 'mailto:info@example.com', 'https://www.google.com/'],
        requests: ['http://localhost:8080/js/dev.js', 'https://site.it/app.js'],
      },
      'site.it',
    );

    expect(codes(issues)).toEqual([
      'critical: content.placeholderText',
      'critical: content.devLinks',
      'warning: content.defaultCmsText',
      'warning: content.placeholderContact',
      'warning: content.todoText',
    ]);
    expect(issues[1]?.params.urls).toEqual(['https://staging.site.it/contatti', 'http://localhost:8080/js/dev.js']);
    expect(issues[3]?.params.items).toEqual(['info@example.com']);
    // "Lorem ipsum dolor sit amet" matches twice but gives a single excerpt.
    expect(issues[0]?.params.snippets).toHaveLength(1);
    expect(String((issues[0]?.params.snippets as string[])[0])).toContain('Lorem ipsum');
  });

  it('does not flag the site itself when it runs on a local address', () => {
    expect(checkContent({ ...goodPage, url: 'http://localhost:3000/', links: ['http://localhost:3000/chi-siamo'] }, 'localhost')).toEqual([]);
  });
});

describe('isDevHost', () => {
  it('recognizes local and staging hosts only', () => {
    expect(['localhost', '127.0.0.1', '192.168.1.20', 'sito.local', 'staging.sito.it', 'dev-sito.it'].every(isDevHost)).toBe(true);
    expect(['sito.it', 'www.sito.it', 'developer.mozilla.org', 'testimonianze.it'].some(isDevHost)).toBe(false);
  });
});

describe('checkLegal', () => {
  it('accepts a site with privacy, cookie policy, consent banner and VAT number', () => {
    const page = { ...goodPage, text: LEGAL_FOOTER, trackers: ['Google Analytics'], hasConsentBanner: true };
    expect(checkLegal([page], 'https://site.it/')).toEqual([]);
  });

  it('reports what an Italian site is missing', () => {
    const issues = checkLegal([{ ...goodPage, text: 'Home', trackers: ['Meta Pixel'] }], 'https://site.it/');
    expect(codes(issues)).toEqual([
      'warning: legal.privacyMissing',
      'warning: legal.cookiePolicyMissing',
      'warning: legal.cookieBannerMissing',
      'warning: legal.vatMissing',
    ]);
    expect(issues[2]?.params.trackers).toEqual(['Meta Pixel']);
  });

  it('finds legal links on any page and asks for the VAT number only on Italian sites', () => {
    const home = { ...goodPage, url: 'https://site.com/', lang: 'en', text: 'Home' };
    const privacy = { ...goodPage, url: 'https://site.com/legal', lang: 'en', links: ['https://site.com/privacy-and-cookies'], text: '' };
    expect(checkLegal([home, privacy], 'https://site.com/')).toEqual([]);
  });
});

describe('parseRobots', () => {
  it('detects a site closed to search engines and lists sitemaps', () => {
    expect(parseRobots('User-agent: *\nDisallow: /\nSitemap: https://site.it/sitemap.xml')).toEqual({
      blocksAll: true,
      sitemaps: ['https://site.it/sitemap.xml'],
    });
  });

  it('ignores rules for other bots and partial disallows', () => {
    const robots = 'User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin/ # private\nAllow: /';
    expect(parseRobots(robots)).toEqual({ blocksAll: false, sitemaps: [] });
  });

  it('applies rules to every agent of a group', () => {
    expect(parseRobots('User-agent: Googlebot\nUser-agent: *\nDisallow: /').blocksAll).toBe(true);
  });
});

describe('checkLegal on Russian sites', () => {
  /** A Russian page that passes the generic legal checks (privacy, cookies), so only Russian rules remain. */
  const ruPage = {
    ...goodPage,
    url: 'https://site.ru/',
    lang: 'ru',
    text: 'Политика конфиденциальности · Политика cookie',
  };
  const contactForm = (checkboxes: { checked: boolean; label: string; clickable?: boolean | null }[], text = '') => ({
    action: '/send',
    personalFields: ['email', 'phone'],
    checkboxes: checkboxes.map((box, index) => ({ id: `0-${index}`, disabled: false, clickable: null, ...box })),
    text,
  });
  const ruCodes = (pages: Parameters<typeof checkLegal>[0], url = 'https://site.ru/') =>
    codes(checkLegal(pages, url)).filter((code) => code.includes('legal.ru'));

  it('accepts a form with a separate, unticked consent checkbox', () => {
    const form = contactForm([{ checked: false, label: 'Я даю согласие на обработку персональных данных' }]);
    expect(ruCodes([{ ...ruPage, forms: [form] }])).toEqual([]);
  });

  it('reports forms without consent, with a pre-ticked box, or with consent only in the text', () => {
    const issues = checkLegal(
      [
        {
          ...ruPage,
          forms: [
            contactForm([]),
            contactForm([{ checked: true, label: 'Согласен на обработку персональных данных' }]),
            contactForm([], 'Нажимая кнопку «Отправить», вы соглашаетесь на обработку персональных данных'),
          ],
        },
      ],
      'https://site.ru/',
    );

    expect(codes(issues)).toEqual([
      'warning: legal.ruConsentMissing',
      'warning: legal.ruConsentPrechecked',
      'info: legal.ruConsentNoCheckbox',
    ]);
    expect(issues[0]?.params.items).toEqual(['email, phone → /send']);
  });

  it('reports a consent checkbox that a visitor can’t tick', () => {
    const form = contactForm([{ checked: false, clickable: false, label: 'Даю согласие на обработку персональных данных' }]);
    expect(ruCodes([{ ...ruPage, forms: [form] }])).toEqual(['warning: legal.ruConsentNotClickable']);
    // Tickable: fine.
    expect(ruCodes([{ ...ruPage, forms: [{ ...form, checkboxes: [{ ...form.checkboxes[0]!, clickable: true }] }] }])).toEqual([]);
  });

  it('flags foreign analytics but not Yandex Metrica', () => {
    const page = {
      ...ruPage,
      trackers: ['Yandex Metrica'],
      requests: ['https://www.googletagmanager.com/gtag/js?id=G-1', 'https://mc.yandex.ru/metrika/tag.js'],
    };
    const issues = checkLegal([page], 'https://site.ru/');
    expect(issues.find((issue) => issue.code === 'legal.ruForeignServices')?.params.trackers).toEqual(['Google Tag Manager']);
    expect(ruCodes([{ ...ruPage, trackers: ['Yandex Metrica'] }])).toEqual([]);
  });

  it('asks online shops for ИНН/ОГРН', () => {
    const shop = { ...ruPage, text: `${ruPage.text} Добавить в корзину · 1 990 ₽` };
    expect(ruCodes([shop])).toEqual(['warning: legal.ruSellerDetailsMissing']);
    expect(ruCodes([{ ...shop, text: `${shop.text} ООО «Ромашка», ИНН 7701234567, ОГРН 1027700132195` }])).toEqual([]);
  });

  it('applies only to Russian sites', () => {
    const italian = { ...goodPage, text: 'Privacy policy · Cookie policy · P.IVA 01234567890', forms: [contactForm([])] };
    expect(ruCodes([italian], 'https://site.it/')).toEqual([]);
    // A .ru domain counts even without lang="ru".
    expect(ruCodes([{ ...italian, lang: null }], 'https://site.ru/')).toEqual(['warning: legal.ruConsentMissing']);
  });
});

describe('Russian language law (168-ФЗ)', () => {
  const ruPage = {
    ...goodPage,
    url: 'https://site.ru/',
    lang: 'ru',
    text: 'Политика конфиденциальности · Политика cookie',
    cyrillicShare: 0.9,
  };
  const languageIssue = (page: typeof ruPage) =>
    checkLegal([page], 'https://site.ru/').find((issue) => issue.code === 'legal.ruForeignLanguage');

  it('reports menus and buttons written only in a foreign language', () => {
    const issue = languageIssue({ ...ruPage, foreignUiTexts: ['Shop', 'SALE', 'Contact us'] });
    expect(issue).toMatchObject({ severity: 'warning', params: { items: ['Shop', 'SALE', 'Contact us'] } });
  });

  it('ignores acronyms, e-mails, addresses and numbers', () => {
    expect(languageIssue({ ...ruPage, foreignUiTexts: ['PDF', 'info@site.ru', 'www.site.ru', '+7 495 123-45-67'] })).toBeUndefined();
  });

  it('does not judge pages that are mostly in another language (e.g. the English version)', () => {
    expect(languageIssue({ ...ruPage, cyrillicShare: 0.05, foreignUiTexts: ['Shop'] })).toBeUndefined();
  });
});

describe('isSiteErrorPage', () => {
  it('accepts a designed 404 page that leads back into the site', () => {
    const page = '<header><a href="/">Home</a><a href="/servizi">Servizi</a></header><h1>Pagina non trovata</h1>';
    expect(isSiteErrorPage(page)).toBe(true);
  });

  it('rejects bare server error pages', () => {
    const nginx = '<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx</center></body></html>';
    expect(isSiteErrorPage(nginx)).toBe(false);
    expect(isSiteErrorPage('<h1>Not Found</h1><p>The requested URL was not found on this server.</p>')).toBe(false);
  });
});
