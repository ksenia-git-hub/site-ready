// Functions passed to page.evaluate() run inside the browser, not in Node:
// they can't use imports or variables from this file, only the DOM.

import type { Page } from 'playwright';
import type { DomData, MobileData } from './types.ts';

export function extractPage(page: Page): Promise<DomData> {
  return page.evaluate(() => {
    const meta = (name: string) =>
      document.querySelector(`meta[name="${name}" i]`)?.getAttribute('content')?.trim() || null;
    const property = (name: string) =>
      document.querySelector(`meta[property="${name}" i]`)?.getAttribute('content')?.trim() || null;
    const globals = window as unknown as Record<string, unknown>;

    // Consent platforms expose a global; hand-made banners usually have "cookie"/"consent" in an id or class.
    const consentGlobals = ['__tcfapi', 'Cookiebot', 'OneTrust', '_iub', 'CookieConsent', 'Complianz', 'klaro', 'tarteaucitron', 'UC_UI'];
    const visibleBanner = Array.from(
      document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i]'),
    ).some((el) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && (el.textContent ?? '').trim().length > 20;
    });

    const trackerGlobals: Record<string, string> = {
      gtag: 'Google Analytics',
      ga: 'Google Analytics',
      fbq: 'Meta Pixel',
      ym: 'Yandex Metrica',
      hj: 'Hotjar',
      clarity: 'Microsoft Clarity',
      _paq: 'Matomo',
      ttq: 'TikTok Pixel',
      lintrk: 'LinkedIn Insight',
    };
    const trackers = new Set(Object.entries(trackerGlobals).filter(([name]) => name in globals).map(([, label]) => label));
    if (Array.isArray(globals.dataLayer) && (globals.dataLayer as unknown[]).some((entry) => typeof entry === 'object' && entry !== null && 'gtm.start' in entry)) {
      trackers.add('Google Tag Manager');
    }

    // Link texts that mean nothing when a screen reader lists the links of the page.
    const genericText =
      /^(clicca qui|clicca|qui|leggi di più|leggi tutto|scopri di più|continua|click here|here|read more|learn more|more|подробнее|здесь|читать далее|узнать больше|нажмите здесь)$/i;
    const genericLinks = Array.from(document.querySelectorAll('a[href]'), (a) => a as HTMLAnchorElement)
      .filter((a) => !a.hasAttribute('aria-label') && !a.hasAttribute('aria-labelledby'))
      .map((a) => ({ text: (a.textContent ?? '').trim().replace(/[s.…→»>]+$/, ''), href: a.href }))
      .filter((link) => genericText.test(link.text))
      .map((link) => `${link.text} → ${link.href}`);

    // Forms that collect personal data (not logins, not searches), with their checkboxes,
    // to check the consent required by privacy laws.
    const personalField = /name|phone|mail|имя|фио|фамил|телефон|почт|nome|cognome|telefono/i;
    const forms = Array.from(document.forms)
      .filter((form) => !form.querySelector('input[type="password"]'))
      .map((form, formIndex) => {
        const fields = Array.from(form.querySelectorAll('input, textarea, select'), (el) => el as HTMLInputElement).filter(
          (field) => !['hidden', 'submit', 'button', 'search', 'checkbox', 'radio'].includes(field.type),
        );
        const personal = fields
          .filter(
            (field) =>
              field.type === 'email' ||
              field.type === 'tel' ||
              personalField.test(`${field.name} ${field.id} ${field.placeholder ?? ''} ${field.getAttribute('autocomplete') ?? ''}`),
          )
          .map((field) => field.name || field.type);
        const checkboxes = Array.from(form.querySelectorAll('input[type="checkbox"]'), (el) => el as HTMLInputElement).map((box, boxIndex) => {
          // A marker so the scanner can find this box again and try to tick it like a visitor.
          const id = `${formIndex}-${boxIndex}`;
          box.setAttribute('data-site-ready-checkbox', id);
          return {
            id,
            disabled: box.disabled,
            clickable: null,
            checked: box.defaultChecked || box.checked,
            label: (box.labels?.[0]?.textContent ?? box.closest('label')?.textContent ?? box.parentElement?.textContent ?? '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 300),
          };
        });
        return {
          action: form.getAttribute('action') ?? '',
          personalFields: [...new Set(personal)],
          checkboxes,
          text: (form.innerText ?? '').replace(/\s+/g, ' ').slice(0, 2000),
        };
      })
      .filter((form) => form.personalFields.length > 0);

    // Texts aimed at visitors (menus, buttons, headings) written only in Latin letters, and how much
    // of the page is in Cyrillic: Russian law requires consumer information in Russian.
    const foreignUiTexts = [
      ...new Set(
        Array.from(
          document.querySelectorAll('h1, h2, h3, nav a, header a, footer a, button, [role="button"], input[type="submit"], label'),
          (el) => (el instanceof HTMLInputElement ? el.value : (el.textContent ?? '')).replace(/\s+/g, ' ').trim(),
        ).filter((text) => text.length >= 2 && text.length <= 60 && /[A-Za-z]{2}/.test(text) && !/[А-Яа-яЁё]/.test(text)),
      ),
    ].slice(0, 40);
    const bodyText = document.body?.innerText ?? '';
    const cyrillic = (bodyText.match(/[А-Яа-яЁё]/g) ?? []).length;
    const latin = (bodyText.match(/[A-Za-z]/g) ?? []).length;

    return {
      url: location.href,
      title: document.title.trim() || null,
      metaDescription: meta('description'),
      robots: meta('robots'),
      lang: document.documentElement.getAttribute('lang')?.trim() || null,
      h1Count: document.querySelectorAll('h1').length,
      hasViewportMeta: meta('viewport') !== null,
      links: Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).href),
      images: Array.from(document.images, (img) => ({
        src: img.currentSrc || img.src,
        alt: img.getAttribute('alt'),
        renderedWidth: img.clientWidth,
        naturalWidth: img.naturalWidth,
      })),
      ogTitle: property('og:title'),
      ogImage: property('og:image'),
      hasFaviconLink: document.querySelector('link[rel~="icon" i]') !== null,
      text: (document.body?.innerText ?? '').slice(0, 100_000),
      hasConsentBanner: visibleBanner || consentGlobals.some((name) => name in globals),
      trackers: [...trackers],
      genericLinks,
      forms,
      foreignUiTexts,
      cyrillicShare: cyrillic + latin > 0 ? cyrillic / (cyrillic + latin) : 0,
    };
  });
}

/** Scrolls back up so the screenshot shows what a visitor sees first. */
export async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

export function extractMobile(page: Page): Promise<MobileData> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const limit = viewportWidth + 1;
    const overflowing: string[] = [];

    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const classes = Array.from(el.classList, (name) => `.${name}`).slice(0, 2).join('');
      const width = Math.round(el.getBoundingClientRect().width);
      return `${el.tagName.toLowerCase()}${id}${classes} (${width}px)`;
    };

    if (root.scrollWidth > limit) {
      // Report the outermost elements that stick out, not every descendant of them.
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        if (el.getBoundingClientRect().right <= limit) continue;
        const parent = el.parentElement;
        if (parent && parent !== document.body && parent.getBoundingClientRect().right > limit) continue;
        overflowing.push(describe(el));
        if (overflowing.length >= 5) break;
      }
    }

    return { viewportWidth, scrollWidth: root.scrollWidth, overflowing };
  });
}

/**
 * Runs in every page before its own scripts (context.addInitScript): records the Largest Contentful
 * Paint and the layout shifts as they happen. CLS is the plain sum of shifts, a slight overestimate
 * of Google's "worst session window" on long pages.
 */
export function observeSpeed(): void {
  const store = { lcp: null as number | null, cls: 0 };
  (window as unknown as { __siteReadySpeed: typeof store }).__siteReadySpeed = store;
  try {
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) store.lcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) store.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Old engine without these entry types: the metrics stay empty.
  }
}

/** Timings of the page load. Read before scrolling: scrolling would change LCP and CLS. */
export async function readSpeed(page: Page): Promise<{ ttfbMs: number; lcpMs: number | null; cls: number; loadMs: number } | null> {
  // LCP is reported asynchronously: give the observer a moment after the load event.
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const store = (window as unknown as { __siteReadySpeed?: { lcp: number | null; cls: number } }).__siteReadySpeed;
    if (!navigation) return null;
    return {
      ttfbMs: Math.round(navigation.responseStart),
      lcpMs: store?.lcp == null ? null : Math.round(store.lcp),
      cls: Math.round((store?.cls ?? 0) * 1000) / 1000,
      loadMs: Math.round(navigation.loadEventEnd || performance.now()),
    };
  });
}

/** Scrolls down a screen at a time, so lazy images and animations load before the full-page screenshot. */
export async function scrollThrough(page: Page, maxHeight: number): Promise<void> {
  await page.evaluate(async (max) => {
    const step = Math.max(200, Math.round(window.innerHeight * 0.9));
    const end = Math.min(document.documentElement.scrollHeight, max);
    for (let y = 0; y < end; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }, maxHeight);
}
