import { CATEGORIES, type Category, type Issue, type IssueCode, type ScanReport, type Severity } from '@qa/shared';

export type Grade = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Penalty of one kind of problem, before taking into account how many pages it affects.
 * Like Semrush, Ahrefs and SE Ranking, errors weigh much more than warnings. Suggestions ("info")
 * weigh very little: 1–2 points per kind in a category, a fraction of a point on the whole site,
 * just enough that 100 means "nothing at all was found".
 */
const WEIGHTS: Record<Severity, number> = {
  critical: 12,
  warning: 1.5,
  info: 0.25,
};

/**
 * How fast the score drops: score = 100 × K / (K + penalties). A smooth curve that never reaches
 * 0, so a pile of small issues can't sink a site that works fine. With K = 50:
 * one broken link on one page → 88, noindex on the whole site → 81, a typical real site with
 * a few errors and a dozen kinds of warnings → ~60, a site broken everywhere → below 50.
 */
const K = 50;

/**
 * Problems of the site as a whole (robots.txt, HTTPS, privacy policy…): reported once on the home
 * page, but they concern every page, so they count as affecting all of them.
 */
const SITE_WIDE_CODES = new Set<IssueCode>([
  'seo.robotsBlocksAll',
  'seo.robotsMissing',
  'seo.sitemapMissing',
  'seo.faviconMissing',
  'seo.soft404',
  'technical.noHttps',
  'technical.httpNotRedirected',
  'technical.certExpiring',
  'technical.default404Page',
  'legal.privacyMissing',
  'legal.cookiePolicyMissing',
  'legal.cookieBannerMissing',
  'legal.cookiesBeforeConsent',
  'legal.ruCookiesBeforeConsent',
  'legal.vatMissing',
  'legal.ruForeignServices',
  'legal.ruSellerDetailsMissing',
]);

type ReportInput = Pick<ScanReport, 'issues'> & { summary: Pick<ScanReport['summary'], 'pagesScanned'> };

/** All occurrences of one kind of problem, with how much it weighs on the score. */
export interface ProblemKind {
  /** Same key as the issue groups of the report: severity, code and (for unknown axe rules) the rule. */
  key: string;
  severity: Severity;
  issues: Issue[];
  /** Pages where the problem shows up (all of them for site-wide problems). */
  affectedPages: number;
  /** A problem of the whole site rather than of some pages. */
  siteWide: boolean;
  /** Points it takes off: its weight scaled by the share of pages affected (0 for suggestions). */
  impact: number;
}

/** Groups the issues by kind of problem. The report, the score and "fix first" all use these keys. */
export function problemKey(issue: Issue): string {
  const rule = issue.code === 'accessibility.other' ? `:${String(issue.params.rule)}` : '';
  return `${issue.severity}:${issue.code}${rule}`;
}

/**
 * Each kind of problem counts once, scaled by the share of analyzed pages it affects: on half of
 * the pages it costs 75% of its weight, on every page 100%. Biggest impact first.
 */
export function problemKinds(report: ReportInput): ProblemKind[] {
  const pages = Math.max(1, report.summary.pagesScanned);
  const kinds = new Map<string, { severity: Severity; issues: Issue[]; affected: Set<string> }>();

  for (const issue of report.issues) {
    const key = problemKey(issue);
    const kind = kinds.get(key) ?? { severity: issue.severity, issues: [], affected: new Set<string>() };
    kind.issues.push(issue);
    for (const page of affectedPages(issue)) kind.affected.add(page);
    kinds.set(key, kind);
  }

  return [...kinds]
    .map(([key, { severity, issues, affected }]) => {
      const siteWide = SITE_WIDE_CODES.has(issues[0]!.code);
      const affectedPages = siteWide ? pages : affected.size;
      return {
        key,
        severity,
        issues,
        affectedPages,
        siteWide,
        impact: WEIGHTS[severity] * (0.5 + 0.5 * Math.min(1, affectedPages / pages)),
      };
    })
    .sort((a, b) => b.impact - a.impact || b.affectedPages - a.affectedPages);
}

/** Overall quality from 0 to 100 (see K and WEIGHTS). */
export function qualityScore(report: ReportInput): number {
  const penalty = problemKinds(report).reduce((total, kind) => total + kind.impact, 0);
  return toScore(K, penalty);
}

/**
 * A category has fewer problems than the whole site, so its curve is steeper: one critical problem
 * on every page takes a category to ~62 ("could be better"), a single warning keeps it above 90.
 */
const CATEGORY_K = 20;

export interface CategoryScore {
  /** 0–100, same scale and grades as the overall score. */
  score: number;
  /** How many problems (occurrences) the category has, suggestions included. */
  issues: number;
}

/** A score per category, computed like the overall one but only from that category's problems. */
export function categoryScores(report: ReportInput): Record<Category, CategoryScore> {
  const kinds = problemKinds(report);
  return Object.fromEntries(
    CATEGORIES.map((category) => {
      const inCategory = kinds.filter((kind) => kind.issues[0]!.category === category);
      const penalty = inCategory.reduce((total, kind) => total + kind.impact, 0);
      return [
        category,
        {
          score: toScore(CATEGORY_K, penalty),
          issues: inCategory.reduce((total, kind) => total + kind.issues.length, 0),
        },
      ];
    }),
  ) as Record<Category, CategoryScore>;
}

/** 100 × k / (k + penalty), but never rounded up to 100 when something was found. */
function toScore(k: number, penalty: number): number {
  const score = Math.round((100 * k) / (k + penalty));
  return penalty > 0 ? Math.min(99, score) : 100;
}

/** What to fix first: the kinds of problems that cost the most points (never mere suggestions). */
export function priorityProblems(report: ReportInput, max = 5): ProblemKind[] {
  return problemKinds(report)
    .filter((kind) => kind.severity !== 'info')
    .slice(0, max);
}

/** Pages where the problem shows up: the pages listing a broken link, or the page of the issue. */
function affectedPages(issue: Issue): string[] {
  const foundOn = issue.params.foundOn;
  return Array.isArray(foundOn) && foundOn.length > 0 ? foundOn : [issue.pageUrl];
}

export function gradeOf(score: number): Grade {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

/**
 * One clean hue per grade, in the cool palette of the interface (primary is indigo): the best grade
 * gets the brand color, a low score a raspberry that still stands out without a traffic-light red.
 * A deep tone for the ring, numbers and words; a light tone only at the start of the category bars.
 */
const GRADE_TONES: Record<Grade, { deep: string; light: string }> = {
  excellent: { deep: 'oklch(0.55 0.22 280)', light: 'oklch(0.78 0.12 280)' }, // indigo / violet
  good: { deep: 'oklch(0.6 0.18 255)', light: 'oklch(0.8 0.1 250)' }, // blue
  fair: { deep: 'oklch(0.66 0.13 225)', light: 'oklch(0.84 0.08 215)' }, // light blue / cyan
  poor: { deep: 'oklch(0.6 0.2 350)', light: 'oklch(0.8 0.1 350)' }, // raspberry
};

/** The color of a score's number and verdict: the deep tone of its grade. */
export function scoreColor(score: number): string {
  return GRADE_TONES[gradeOf(score)].deep;
}

/** Fill of a score bar or ring: from the light to the deep tone of the grade's hue. */
export function scoreGradient(score: number): string {
  const { light, deep } = GRADE_TONES[gradeOf(score)];
  return `linear-gradient(to right, ${light}, ${deep})`;
}
