import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accessibility,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  Clock,
  ExternalLink,
  FileText,
  Image,
  Link2,
  PartyPopper,
  Plus,
  Printer,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, SEVERITIES, type Category, type Issue, type ScanReport, type Severity } from '@qa/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDate, formatDuration, issueValues } from '@/format.ts';
import { categoryScores, gradeOf, priorityProblems, problemKey, qualityScore, scoreColor, scoreGradient } from '@/lib/score.ts';
import { cn } from '@/lib/utils';
import { CATEGORY_ICONS, SEVERITY_ICONS, SEVERITY_STYLES } from '@/lib/visuals.ts';
import { IssueGroup } from './IssueGroup.tsx';
import { PageGallery } from './PageGallery.tsx';
import { PriorityFixes } from './PriorityFixes.tsx';
import { ScoreRing } from './ScoreRing.tsx';

interface Props {
  /** Id of the scan, to load its screenshots. */
  jobId: string;
  report: ScanReport;
  createdAt: string;
  onNewScan: () => void;
}

export function Report({ jobId, report, createdAt, onNewScan }: Props) {
  const { t, i18n } = useTranslation();
  const { summary } = report;
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [severities, setSeverities] = useState<Set<Severity>>(new Set(SEVERITIES));
  const [query, setQuery] = useState('');
  const score = qualityScore(report);
  const grade = gradeOf(score);
  const priorities = useMemo(() => priorityProblems(report), [report]);
  const scoresByCategory = useMemo(() => categoryScores(report), [report]);

  // One group per kind of problem; critical groups start open.
  const groups = useMemo(() => {
    const byKey = new Map<string, Issue[]>();
    for (const issue of report.issues) {
      // Same keys as the score and "fix first" (unknown accessibility rules each get their own group).
      const key = problemKey(issue);
      byKey.set(key, [...(byKey.get(key) ?? []), issue]);
    }
    return [...byKey].map(([key, issues]) => ({ key, issues }));
  }, [report.issues]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(groups.filter((group) => group.issues[0]!.severity === 'critical').map((group) => group.key)),
  );

  // Before printing, open every group so the PDF contains all the details.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done, { once: true });
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const needle = query.trim().toLowerCase();
  const matches = (issue: Issue) => {
    if (!needle) return true;
    const values = issueValues(issue, t);
    const haystack = [
      issue.pageUrl,
      t(`issues.${issue.code}.title`, values),
      t(`issues.${issue.code}.description`, values),
      ...Object.values(issue.params).flat().map(String),
    ];
    return haystack.some((text) => text.toLowerCase().includes(needle));
  };
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      issues: group.issues.filter(
        (issue) => (category === 'all' || issue.category === category) && severities.has(issue.severity) && matches(issue),
      ),
    }))
    .filter((group) => group.issues.length > 0);

  // The severity chips in the score card jump to the list, filtered on that severity only.
  const issuesRef = useRef<HTMLElement>(null);
  const showSeverity = (severity: Severity) => {
    setSeverities(new Set([severity]));
    setCategory('all');
    setQuery('');
    setOpenGroups(new Set(groups.filter((group) => group.issues[0]!.severity === severity).map((group) => group.key)));
    issuesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // "Fix first" → "Details": show every issue, open that group and scroll to it once it is rendered.
  const showProblem = (key: string) => {
    setSeverities(new Set(SEVERITIES));
    setCategory('all');
    setQuery('');
    setOpenGroups((open) => new Set([...open, key]));
    requestAnimationFrame(() =>
      document.getElementById(groupDomId(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  // A tile filters the list on its category (a second click shows everything again) and scrolls to it.
  const pickCategory = (key: Category) => {
    const next = category === key ? 'all' : key;
    setCategory(next);
    if (next !== 'all') issuesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleSeverity = (severity: Severity) => {
    const next = new Set(severities);
    if (next.has(severity)) next.delete(severity);
    else next.add(severity);
    setSeverities(next);
  };
  const allOpen = visibleGroups.length > 0 && visibleGroups.every((group) => openGroups.has(group.key));
  const setAllOpen = (open: boolean) => setOpenGroups(open ? new Set(groups.map((group) => group.key)) : new Set());

  const facts = [
    { icon: FileText, label: t('report.stats.pagesScanned'), value: summary.pagesScanned },
    { icon: Link2, label: t('report.stats.linksChecked'), value: summary.linksChecked },
    { icon: Image, label: t('report.stats.imagesChecked'), value: summary.imagesChecked },
    { icon: Clock, label: t('report.stats.duration'), value: formatDuration(summary.durationMs, t) },
  ];

  return (
    <div className="hero-glow">
      <article className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-10">
        {/* Title and actions */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {/* The app header isn't printed: the PDF still says which tool made the report. */}
            <p className="mb-2 hidden text-xs text-muted-foreground print:block">
              <span className="font-semibold text-foreground">{t('app.name')}</span> · {t('app.tagline')}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{t('report.title')}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <a
                href={report.startUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
              >
                {report.startUrl}
                <ExternalLink className="no-print size-3" />
              </a>
              <span>· {formatDate(createdAt, i18n.resolvedLanguage ?? 'en')}</span>
            </p>
          </div>
          <div className="no-print flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setPrinting(true)}>
              <Printer />
              {t('report.print')}
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={onNewScan}>
              <Plus />
              {t('report.newScan')}
            </Button>
          </div>
        </header>

        {/* Score + totals */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card className="print-avoid-break flex-row items-center gap-6 p-6">
            <ScoreRing score={score} label={t('report.score.label')} />
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">{t('report.score.label')}</p>
                <p className="text-2xl font-semibold tracking-tight">{t(`report.score.${grade}`)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('report.score.hint')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('report.score.scale')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map((severity) => {
                  const Icon = SEVERITY_ICONS[severity];
                  const style = SEVERITY_STYLES[severity];
                  return (
                    <button
                      key={severity}
                      type="button"
                      onClick={() => showSeverity(severity)}
                      disabled={summary.issuesBySeverity[severity] === 0}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all enabled:hover:-translate-y-px enabled:hover:shadow-sm disabled:cursor-default',
                        style.border,
                        style.soft,
                        style.text,
                      )}
                    >
                      <Icon className="size-3.5" />
                      <span className="tabular-nums">{summary.issuesBySeverity[severity]}</span>
                      {t(`severityPlural.${severity}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            {facts.map(({ icon: Icon, label, value }) => (
              <Card key={label} className="print-avoid-break gap-1 p-4">
                <Icon className="size-4 text-muted-foreground" />
                <span className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </Card>
            ))}
          </div>
        </div>

        <PriorityFixes problems={priorities} pagesScanned={summary.pagesScanned} onShow={showProblem} />

        {/* Categories */}
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t('report.byCategory')}</h2>
          {/* Tiles: each category gets its own 0–100 score, colored and worded like the overall one. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CATEGORIES.map((key) => {
              const Icon = CATEGORY_ICONS[key];
              const { score: categoryScore, issues: count } = scoresByCategory[key];
              const categoryGrade = gradeOf(categoryScore);
              const color = scoreColor(categoryScore);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickCategory(key)}
                  aria-pressed={category === key}
                  className={cn(
                    'print-avoid-break flex flex-col rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40',
                    category === key && 'border-primary ring-3 ring-primary/15',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-right leading-none">
                      <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
                        {categoryScore}
                      </span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-tight font-medium break-words">{t(`categories.${key}`)}</p>
                  <p className="mt-0.5 text-xs font-medium" style={{ color }}>
                    {t(`report.score.${categoryGrade}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('report.categoryCount', { count })}</p>
                  {/* The bar is the score itself: filled to 92% means 92 out of 100. */}
                  <div className="mt-auto pt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${categoryScore}%`, background: scoreGradient(categoryScore) }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {report.warnings.length > 0 && (
          <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <ul className="space-y-1">
              {report.warnings.map((warning) => (
                <li key={warning.code}>{t(`warnings.${warning.code}`, { count: warning.count, max: warning.max })}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Issues */}
        <section ref={issuesRef} className="scroll-mt-20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{t('report.issues')}</h2>
            <Button variant="ghost" size="sm" className="no-print" onClick={() => setAllOpen(!allOpen)}>
              {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
              {allOpen ? t('report.collapseAll') : t('report.expandAll')}
            </Button>
          </div>

          <div className="no-print flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label={t('report.filters.severity')} className="flex gap-1">
                {SEVERITIES.map((severity) => {
                  const Icon = SEVERITY_ICONS[severity];
                  const style = SEVERITY_STYLES[severity];
                  const active = severities.has(severity);
                  return (
                    <Button
                      key={severity}
                      variant="outline"
                      size="sm"
                      aria-pressed={active}
                      onClick={() => toggleSeverity(severity)}
                      className={cn(active ? cn(style.border, style.soft, style.text) : 'text-muted-foreground opacity-60')}
                    >
                      <Icon />
                      <span className="tabular-nums">{summary.issuesBySeverity[severity]}</span>
                    </Button>
                  );
                })}
              </div>
              <div className="relative min-w-48 flex-1 sm:max-w-72">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('report.search')}
                  className="pl-8"
                  aria-label={t('report.search')}
                />
              </div>
              {category !== 'all' && (
                <button
                  type="button"
                  onClick={() => setCategory('all')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-1 pr-2 pl-3 text-xs font-medium text-primary hover:bg-primary/15"
                  aria-label={t('report.filters.clear')}
                >
                  {t('report.filters.showing', { category: t(`categories.${category}`) })}
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {report.issues.length === 0 ? (
            <Card className="items-center gap-2 p-10 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-success/10 text-success">
                <PartyPopper className="size-6" />
              </span>
              <p className="text-lg font-semibold">{t('report.allGood')}</p>
              <p className="text-sm text-muted-foreground">{t('report.noIssues')}</p>
            </Card>
          ) : category !== 'all' && summary.issuesByCategory[category] === 0 ? (
            // A section without problems: say so plainly instead of showing an empty list.
            <p className="flex items-center justify-center gap-2 rounded-xl border border-success/30 bg-success/5 p-10 text-center text-sm">
              <CircleCheck className="size-5 shrink-0 text-success" />
              {t('report.categoryEmpty', { category: t(`categories.${category}`) })}
            </p>
          ) : visibleGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {t('report.noIssuesFiltered')}
            </p>
          ) : (
            <div className="space-y-2">
              {visibleGroups.map((group) => (
                <IssueGroup
                  key={group.key}
                  domId={groupDomId(group.key)}
                  issues={group.issues}
                  open={printing || openGroups.has(group.key)}
                  onOpenChange={(open) => {
                    const next = new Set(openGroups);
                    if (open) next.add(group.key);
                    else next.delete(group.key);
                    setOpenGroups(next);
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Accessibility className="mt-0.5 size-3.5 shrink-0" />
          {t('report.a11yNote')}
        </p>

        <PageGallery jobId={jobId} pages={report.pages} issues={report.issues} />
      </article>
    </div>
  );
}

/** DOM id of an issue group, to scroll to it from "what to fix first". */
function groupDomId(key: string): string {
  return `problem-${key.replace(/[^\w-]/g, '-')}`;
}
