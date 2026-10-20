import {
  CATEGORIES,
  SEVERITIES,
  type Category,
  type Issue,
  type PageSummary,
  type ScanReport,
  type ScanWarning,
  type Severity,
} from '@qa/shared';
import type { IssueDraft } from './types.ts';

export interface ReportInput {
  startUrl: string;
  pages: PageSummary[];
  drafts: IssueDraft[];
  warnings: ScanWarning[];
  linksChecked: number;
  imagesChecked: number;
  durationMs: number;
}

/** Sorts issues (most severe first), assigns ids and computes the totals. */
export function buildReport(input: ReportInput): ScanReport {
  const issues: Issue[] = [...input.drafts]
    .sort(
      (a, b) =>
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
        CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
        a.pageUrl.localeCompare(b.pageUrl),
    )
    .map((draft, index) => ({ id: `issue-${index + 1}`, ...draft }));

  const issuesBySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  const issuesByCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const issue of issues) {
    issuesBySeverity[issue.severity]++;
    issuesByCategory[issue.category]++;
  }

  return {
    startUrl: input.startUrl,
    pages: input.pages,
    summary: {
      pagesScanned: input.pages.length,
      linksChecked: input.linksChecked,
      imagesChecked: input.imagesChecked,
      durationMs: input.durationMs,
      issuesBySeverity,
      issuesByCategory,
    },
    issues,
    warnings: input.warnings,
  };
}
