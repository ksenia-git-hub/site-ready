// Accessibility checks with axe-core (the engine also used by Lighthouse), run inside the page
// the browser already opened. Automated tools find only part of the problems: the report says so.

import { createRequire } from 'node:module';
import type { IssueCode, Severity } from '@qa/shared';
import type { Page } from 'playwright';
import type { AxeViolation, IssueDraft, PageData } from './types.ts';

const AXE_SCRIPT = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const MAX_NODES = 20;

/** axe rules with their own texts in the three languages; any other rule becomes "accessibility.other". */
const RULE_CODES: Record<string, IssueCode> = {
  'color-contrast': 'accessibility.colorContrast',
  'link-name': 'accessibility.linkName',
  'button-name': 'accessibility.buttonName',
  label: 'accessibility.formLabel',
  'select-name': 'accessibility.selectName',
  'input-button-name': 'accessibility.inputButtonName',
  'input-image-alt': 'accessibility.inputImageAlt',
  'frame-title': 'accessibility.frameTitle',
  'meta-viewport': 'accessibility.zoomDisabled',
  'heading-order': 'accessibility.headingOrder',
  'empty-heading': 'accessibility.emptyHeading',
  list: 'accessibility.listStructure',
  listitem: 'accessibility.listItem',
  'aria-allowed-attr': 'accessibility.ariaAllowedAttr',
  'aria-required-attr': 'accessibility.ariaRequiredAttr',
  'aria-valid-attr-value': 'accessibility.ariaValidValue',
  'aria-hidden-focus': 'accessibility.ariaHiddenFocus',
  'nested-interactive': 'accessibility.nestedInteractive',
  'svg-img-alt': 'accessibility.svgImgAlt',
  'role-img-alt': 'accessibility.roleImgAlt',
  tabindex: 'accessibility.positiveTabindex',
  'autocomplete-valid': 'accessibility.autocompleteValid',
  'scrollable-region-focusable': 'accessibility.scrollableRegion',
  'link-in-text-block': 'accessibility.linkInTextBlock',
  'video-caption': 'accessibility.videoCaption',
};

/**
 * Rules switched off: some repeat checks we already do (alt, lang, title, H1), others flag
 * page structure (landmarks, regions) and would bury the useful findings under noise.
 */
const DISABLED_RULES = [
  'image-alt',
  'html-has-lang',
  'document-title',
  'page-has-heading-one',
  'region',
  'meta-viewport-large',
  'frame-tested',
];

const IMPACT_SEVERITY: Record<string, Severity> = {
  critical: 'critical',
  serious: 'warning',
  moderate: 'warning',
  minor: 'info',
};

/** Injects axe-core into the page and returns its violations, or [] if it can't run (e.g. strict CSP). */
export async function runAxe(page: Page): Promise<AxeViolation[]> {
  try {
    await page.addScriptTag({ path: AXE_SCRIPT });
    return await page.evaluate(
      async ({ disabled, maxNodes }) => {
        const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
        const off = [
          ...disabled,
          ...axe.getRules().map((rule) => rule.ruleId).filter((id) => id.startsWith('landmark-')),
        ];
        const results = await axe.run(document, {
          resultTypes: ['violations'],
          rules: Object.fromEntries(off.map((id) => [id, { enabled: false }])),
        });
        return results.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact ?? 'moderate',
          help: violation.help,
          helpUrl: violation.helpUrl,
          nodes: violation.nodes.slice(0, maxNodes).map((node) => {
            const html = node.html.replace(/\s+/g, ' ').trim();
            const ratio = (node.any[0]?.data as { contrastRatio?: number } | undefined)?.contrastRatio;
            return `${html.length > 140 ? `${html.slice(0, 140)}…` : html}${ratio ? ` — ${ratio}:1` : ''}`;
          }),
          total: violation.nodes.length,
        }));
      },
      { disabled: DISABLED_RULES, maxNodes: MAX_NODES },
    );
  } catch {
    return [];
  }
}

export function checkAccessibility(page: PageData): IssueDraft[] {
  const issues: IssueDraft[] = page.accessibility.map((violation) => {
    const code = RULE_CODES[violation.id] ?? 'accessibility.other';
    return {
      code,
      category: 'accessibility',
      severity: IMPACT_SEVERITY[violation.impact] ?? 'warning',
      pageUrl: page.url,
      params: {
        rule: violation.id,
        count: violation.total,
        nodes: violation.nodes,
        // Unknown rules are shown with axe's own (English) summary and guide.
        ...(code === 'accessibility.other' ? { help: violation.help, helpUrl: violation.helpUrl } : {}),
      },
    };
  });

  if (page.genericLinks.length > 0) {
    issues.push({
      code: 'accessibility.genericLinkText',
      category: 'accessibility',
      severity: 'info',
      pageUrl: page.url,
      params: { count: page.genericLinks.length, items: page.genericLinks.slice(0, MAX_NODES) },
    });
  }
  return issues;
}
