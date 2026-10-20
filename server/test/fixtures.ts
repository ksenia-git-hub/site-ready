// Shared test data (kept out of *.test.ts files so importing it doesn't re-run their tests).
import type { PageData } from '../src/scan/types.ts';

/** A page with no problems at all; tests override single fields to trigger one rule. */
export const goodPage: PageData = {
  url: 'https://site.it/',
  title: 'Studio Rossi – Architettura a Milano',
  metaDescription: 'Progettazione e ristrutturazione di case e uffici a Milano, dal concept al cantiere.',
  robots: null,
  lang: 'it',
  h1Count: 1,
  hasViewportMeta: true,
  links: [],
  images: [{ src: 'https://site.it/a.jpg', alt: 'Facciata', renderedWidth: 600, naturalWidth: 1200 }],
  ogTitle: 'Studio Rossi',
  ogImage: 'https://site.it/og.jpg',
  hasFaviconLink: true,
  text: '',
  hasConsentBanner: false,
  trackers: [],
  genericLinks: [],
  forms: [],
  foreignUiTexts: [],
  cyrillicShare: 0,
  requests: [],
  failedResources: [],
  jsErrors: [],
  mixedContent: [],
  resources: [],
  metrics: null,
  accessibility: [],
};
