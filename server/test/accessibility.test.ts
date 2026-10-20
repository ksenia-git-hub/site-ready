import { describe, expect, it } from 'vitest';
import { checkAccessibility } from '../src/scan/accessibility.ts';
import type { AxeViolation } from '../src/scan/types.ts';
import { goodPage } from './fixtures.ts';

const violation = (id: string, impact: string): AxeViolation => ({
  id,
  impact,
  help: 'Some English summary',
  helpUrl: `https://dequeuniversity.com/rules/axe/4.14/${id}`,
  nodes: ['<p>…</p>'],
  total: 3,
});

describe('checkAccessibility', () => {
  it('finds nothing on a page without violations', () => {
    expect(checkAccessibility(goodPage)).toEqual([]);
  });

  it('maps known axe rules to our codes and impacts to severities', () => {
    const issues = checkAccessibility({
      ...goodPage,
      accessibility: [violation('button-name', 'critical'), violation('color-contrast', 'serious'), violation('heading-order', 'minor')],
    });

    expect(issues.map((issue) => `${issue.severity}: ${issue.code}`)).toEqual([
      'critical: accessibility.buttonName',
      'warning: accessibility.colorContrast',
      'info: accessibility.headingOrder',
    ]);
    expect(issues[0]?.params).toEqual({ rule: 'button-name', count: 3, nodes: ['<p>…</p>'] });
  });

  it('keeps axe’s own summary and guide for rules without translated texts', () => {
    const [issue] = checkAccessibility({ ...goodPage, accessibility: [violation('aria-dialog-name', 'serious')] });
    expect(issue).toMatchObject({
      code: 'accessibility.other',
      params: { rule: 'aria-dialog-name', help: 'Some English summary', helpUrl: expect.stringContaining('aria-dialog-name') },
    });
  });

  it('reports links whose text means nothing out of context', () => {
    const [issue] = checkAccessibility({ ...goodPage, genericLinks: ['clicca qui → https://site.it/mappa'] });
    expect(issue).toMatchObject({ code: 'accessibility.genericLinkText', severity: 'info', params: { count: 1 } });
  });
});
