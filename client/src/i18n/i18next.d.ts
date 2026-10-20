// Makes t('some.key') type-checked against the Italian file, the reference language.
// The test in locales.test.ts makes sure English and Russian have the same keys.
import 'i18next';
import type it from './locales/it.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof it };
  }
}
