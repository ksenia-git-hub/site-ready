import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import it from './locales/it.json';
import ru from './locales/ru.json';

export const LANGUAGES = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

export const resources = {
  it: { translation: it },
  en: { translation: en },
  ru: { translation: ru },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: LANGUAGES.map((language) => language.code),
    // Browsers that are in none of our languages get English.
    fallbackLng: 'en',
    detection: {
      // The language picked in the header wins over the browser setting, and is remembered.
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'qa-language',
      // "it-IT" → "it"
      convertDetectedLanguage: (language: string) => language.split('-')[0]!,
    },
    // React already escapes values.
    interpolation: { escapeValue: false },
  });

// Keeps <html lang> in sync for screen readers, hyphenation and the browser's translate prompt.
// The app name is translated too (e.g. "Сайт готов"), so the browser tab follows the language.
const syncHtmlLang = () => {
  document.documentElement.lang = i18n.resolvedLanguage ?? 'en';
  document.title = i18n.t('app.name');
};
syncHtmlLang();
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
