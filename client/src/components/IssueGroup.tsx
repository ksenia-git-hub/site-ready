import { useState } from 'react';
import { ChevronDown, Copy, ExternalLink, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Issue } from '@qa/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ISSUE_LISTS, LIST_LIMIT, issueValues } from '@/format.ts';
import { cn } from '@/lib/utils';
import { CATEGORY_ICONS, SEVERITY_ICONS, SEVERITY_STYLES } from '@/lib/visuals.ts';

interface Props {
  /** id of the block, so the report can scroll to it. */
  domId?: string;
  /** All occurrences of one kind of problem (same code). */
  issues: Issue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IssueGroup({ domId, issues, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const first = issues[0]!;
  const style = SEVERITY_STYLES[first.severity];
  const SeverityIcon = SEVERITY_ICONS[first.severity];
  const CategoryIcon = CATEGORY_ICONS[first.category];
  const firstValues = issueValues(first, t);
  const fix = t(`issues.${first.code}.fix`, firstValues);

  const copyFix = async () => {
    try {
      await navigator.clipboard.writeText(fix);
      toast.success(t('report.copied'));
    } catch {
      // Clipboard blocked (e.g. insecure context): nothing useful to do.
    }
  };

  return (
    <Collapsible
      id={domId}
      open={open}
      onOpenChange={onOpenChange}
      className={cn('print-avoid-break scroll-mt-20 overflow-hidden rounded-xl border bg-card transition-shadow', open && 'shadow-sm')}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', style.soft, style.text)}>
          <SeverityIcon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t(`issues.${first.code}.title`, firstValues)}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('font-medium', style.text)}>{t(`severity.${first.severity}`)}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <CategoryIcon className="size-3" />
              {t(`categories.${first.category}`)}
            </span>
          </span>
        </span>
        <Badge variant="secondary" className="tabular-nums">
          {t('report.occurrences', { count: issues.length })}
        </Badge>
        <ChevronDown className={cn('no-print size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3 border-t px-4 pt-3 pb-4">
          <div className={cn('flex items-start gap-3 rounded-lg border p-3 text-sm', style.border, style.soft)}>
            <Wrench className={cn('mt-0.5 size-4 shrink-0', style.text)} />
            <p className="flex-1">
              <span className="font-medium">{t('report.fix')}</span> {fix}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="no-print" onClick={copyFix} aria-label={t('report.copy')}>
                  <Copy />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('report.copy')}</TooltipContent>
            </Tooltip>
          </div>

          <ul className="divide-y rounded-lg border">
            {issues.map((issue) => (
              <Occurrence key={issue.id} issue={issue} />
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Occurrence({ issue }: { issue: Issue }) {
  const { t } = useTranslation();
  const values = issueValues(issue, t);
  const lists = ISSUE_LISTS.flatMap((name) => {
    const items = issue.params[name];
    return Array.isArray(items) && items.length > 0 ? [{ name, items }] : [];
  });

  return (
    <li className="space-y-2 p-3 text-sm">
      <a
        href={issue.pageUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-primary hover:underline"
      >
        <span className="truncate">{issue.pageUrl}</span>
        <ExternalLink className="no-print size-3 shrink-0" />
      </a>
      <p className="break-words">{t(`issues.${issue.code}.description`, values)}</p>
      {lists.map(({ name, items }) => (
        <ExpandableList key={name} label={t(`lists.${name}`, { count: items.length })} items={items} />
      ))}
    </li>
  );
}

/**
 * Shows the first LIST_LIMIT items and a "…and N more" button that reveals the rest.
 * The hidden items are still rendered, so a printed report / PDF always contains the full list.
 */
function ExpandableList({ label, items }: { label: string; items: string[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const hidden = items.length - LIST_LIMIT;

  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, index) => (
          <li
            key={item}
            className={cn(
              'rounded bg-muted/60 px-2 py-0.5 font-mono text-xs break-all',
              !expanded && index >= LIST_LIMIT && 'hidden print:list-item',
            )}
          >
            {item}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="no-print mt-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
        >
          {expanded ? t('report.showLess') : t('report.andMore', { count: hidden })}
          <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}
