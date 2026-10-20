import { ArrowRight, CircleCheck, ListOrdered } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { issueValues } from '@/format.ts';
import type { ProblemKind } from '@/lib/score.ts';
import { cn } from '@/lib/utils';
import { CATEGORY_ICONS, SEVERITY_STYLES } from '@/lib/visuals.ts';

interface Props {
  /** The most important kinds of problems, biggest impact first (see priorityProblems). */
  problems: ProblemKind[];
  pagesScanned: number;
  /** Opens the problem in the list below and scrolls to it. */
  onShow: (key: string) => void;
}

/**
 * "What to fix first": the 3–5 problems that weigh most on the score, in plain words,
 * so a site owner knows where to start without reading the whole report.
 */
export function PriorityFixes({ problems, pagesScanned, onShow }: Props) {
  const { t } = useTranslation();

  if (problems.length === 0) {
    return (
      <Card className="print-avoid-break flex-row items-center gap-4 border-success/30 bg-success/5 p-5">
        <CircleCheck className="size-8 shrink-0 text-success" />
        <div>
          <p className="font-semibold">{t('report.priorities.allGoodTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('report.priorities.allGood')}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="print-avoid-break gap-4 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ListOrdered className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t('report.priorities.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('report.priorities.subtitle')}</p>
        </div>
      </div>

      <ol className="divide-y rounded-xl border">
        {problems.map((problem, index) => {
          const first = problem.issues[0]!;
          const style = SEVERITY_STYLES[problem.severity];
          const CategoryIcon = CATEGORY_ICONS[first.category];
          return (
            <li key={problem.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <span
                className={cn('grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold', style.soft, style.text)}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">{t(`issues.${first.code}.title`, issueValues(first, t))}</p>
                <p className="text-sm">
                  <span className="text-muted-foreground">{t('report.priorities.why')}</span> {t(`impact.${first.category}`)}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className={cn('font-medium', style.text)}>{t(`severity.${problem.severity}`)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <CategoryIcon className="size-3" />
                    {t(`categories.${first.category}`)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {problem.siteWide
                      ? t('report.priorities.wholeSite')
                      : t('report.priorities.pages', { count: problem.affectedPages, total: pagesScanned })}
                  </span>
                </p>
              </div>
              <Button variant="outline" size="sm" className="no-print self-start sm:self-center" onClick={() => onShow(problem.key)}>
                {t('report.priorities.show')}
                <ArrowRight />
              </Button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
