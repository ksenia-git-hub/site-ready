import { describe, expect, it as test } from 'vitest';
import { FAILURE_REASONS, ISSUE_CODES, type IssueCode } from '@qa/shared';
import en from './locales/en.json';
import it from './locales/it.json';
import ru from './locales/ru.json';

type Tree = { [key: string]: string | Tree };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
/** Plural forms each language needs (Intl.PluralRules categories for integers and fractions). */
const PLURAL_FORMS = { it: ['one', 'other'], en: ['one', 'other'], ru: ['one', 'few', 'many', 'other'] };
const locales = { it, en, ru } as Record<keyof typeof PLURAL_FORMS, Tree>;

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`),
  );
}

/** Keys without plural suffixes: "a.b_one" and "a.b_other" both become "a.b". */
const baseKeys = (tree: Tree) => [...new Set(flatten(tree).map((key) => key.replace(PLURAL_SUFFIX, '')))].sort();

describe('translations', () => {
  test.each(['en', 'ru'] as const)('%s has exactly the same keys as it', (language) => {
    expect(baseKeys(locales[language])).toEqual(baseKeys(it));
  });

  test.each(Object.keys(PLURAL_FORMS) as (keyof typeof PLURAL_FORMS)[])('%s has every plural form it needs', (language) => {
    const keys = flatten(locales[language]);
    const pluralBases = new Set(keys.filter((key) => PLURAL_SUFFIX.test(key)).map((key) => key.replace(PLURAL_SUFFIX, '')));
    for (const base of pluralBases) {
      expect(keys.filter((key) => key.startsWith(`${base}_`)).map((key) => key.slice(base.length + 1)).sort(), base).toEqual(
        [...PLURAL_FORMS[language]].sort(),
      );
    }
  });

  test('every issue code and failure reason the server can send has a text', () => {
    const keys = new Set(baseKeys(it));
    const missing = [
      ...ISSUE_CODES.flatMap((code: IssueCode) =>
        ['title', 'description', 'fix'].map((part) => `issues.${code}.${part}`),
      ),
      ...FAILURE_REASONS.map((reason) => `errors.${reason}`),
    ].filter((key) => !keys.has(key));
    expect(missing).toEqual([]);
  });

  test('placeholders are the same in every language', () => {
    const placeholders = (tree: Tree) => {
      const result = new Map<string, string>();
      const walk = (node: Tree, prefix: string) => {
        for (const [key, value] of Object.entries(node)) {
          if (typeof value !== 'string') walk(value, `${prefix}${key}.`);
          else {
            const base = `${prefix}${key}`.replace(PLURAL_SUFFIX, '');
            // "{{seconds}}" and formatted "{{seconds, number}}" both count as the placeholder "seconds".
            const names = [...value.matchAll(/\{\{(\w+)(?:,[^}]*)?\}\}/g)].map((match) => match[1]!).filter((name) => name !== 'count');
            result.set(base, [...new Set([...(result.get(base)?.split(',').filter(Boolean) ?? []), ...names])].sort().join(','));
          }
        }
      };
      walk(tree, '');
      return Object.fromEntries(result);
    };
    expect(placeholders(locales.en)).toEqual(placeholders(it));
    expect(placeholders(locales.ru)).toEqual(placeholders(it));
  });
});
