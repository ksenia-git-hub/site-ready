import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Clock, Globe, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, DEFAULT_MAX_PAGES } from '@qa/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/format.ts';
import type { RecentScan } from '@/lib/recent-scans.ts';
import { scoreColor } from '@/lib/score.ts';
import { CATEGORY_ICONS } from '@/lib/visuals.ts';

const PAGE_OPTIONS = [1, 5, 10, 25, 50];

interface Props {
  /** Address to show in the field, e.g. after the user stopped a scan to fix a typo. */
  initialUrl?: string;
  onSubmit: (url: string, maxPages: number) => void;
  disabled: boolean;
  recent: RecentScan[];
  onOpenRecent: (scan: RecentScan) => void;
  onClearRecent: () => void;
  onRemoveRecent: (scan: RecentScan) => void;
  /** Shown under the form (API offline, failed scan...). */
  alert?: ReactNode;
}

export function Home({ initialUrl = '', onSubmit, disabled, recent, onOpenRecent, onClearRecent, onRemoveRecent, alert }: Props) {
  const { t, i18n } = useTranslation();
  const [url, setUrl] = useState(initialUrl);
  const [maxPages, setMaxPages] = useState(String(DEFAULT_MAX_PAGES));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (url.trim()) onSubmit(url.trim(), Number(maxPages));
  };

  return (
    <div className="hero-glow">
      <section className="mx-auto max-w-3xl px-4 pt-16 pb-10 text-center sm:pt-24">
        <Badge variant="secondary" className="mb-5 gap-1.5 px-3 py-1 text-xs">
          <Sparkles className="text-primary" />
          {t('app.tagline')}
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t('form.title')}{' '}
          <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">
            {t('form.titleHighlight')}
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">{t('form.intro')}</p>

        <form
          onSubmit={submit}
          className="mx-auto mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl border bg-card p-2 shadow-xl shadow-primary/5 sm:flex-row sm:items-center"
        >
          <label className="relative flex-1">
            <span className="sr-only">{t('form.urlLabel')}</span>
            <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              inputMode="url"
              placeholder={t('form.urlPlaceholder')}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="h-11 border-0 bg-transparent pl-9 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
              autoFocus
              required
            />
          </label>
          <div className="flex gap-2">
            <Select value={maxPages} onValueChange={setMaxPages}>
              <SelectTrigger className="h-11! flex-1 sm:w-40" aria-label={t('form.pagesLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option === 1 ? t('form.onlyThisPage') : t('form.upTo', { count: option })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="lg" className="h-11 px-5" disabled={disabled || !url.trim()}>
              {t('form.submit')}
              <ArrowRight />
            </Button>
          </div>
        </form>
        {alert && <div className="mx-auto mt-4 max-w-2xl text-left">{alert}</div>}
      </section>

      <section className="mx-auto grid max-w-5xl gap-3 px-4 pb-12 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category];
          return (
            <Card key={category} className="gap-2 p-5 transition-colors hover:border-primary/40">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4.5" />
              </span>
              <h3 className="mt-1 font-medium">{t(`categories.${category}`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`features.${category}`)}</p>
            </Card>
          );
        })}
      </section>

      {recent.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-20">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="size-4" />
              {t('recent.title')}
            </h2>
            <Button variant="ghost" size="sm" onClick={onClearRecent} className="text-muted-foreground">
              <Trash2 />
              {t('recent.clear')}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((scan) => (
              // The remove button sits on top of the card: a button can't be nested inside another one.
              <div key={scan.id} className="group/recent relative transition-transform hover:-translate-y-0.5">
                <button
                  type="button"
                  onClick={() => onOpenRecent(scan)}
                  className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3 pr-9 text-left transition-all hover:border-primary/40 hover:shadow-md"
                >
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums"
                    style={{
                      color: scoreColor(scan.score),
                      background: `color-mix(in oklch, ${scoreColor(scan.score)} 12%, transparent)`,
                    }}
                  >
                    {scan.score}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{scan.url.replace(/^https?:\/\//, '')}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(scan.createdAt, i18n.resolvedLanguage ?? 'en')}
                      {scan.critical > 0 && (
                        <span className="ml-1.5 whitespace-nowrap text-critical">· {t('recent.critical', { count: scan.critical })}</span>
                      )}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveRecent(scan)}
                  aria-label={`${t('recent.remove')}: ${scan.url}`}
                  title={t('recent.remove')}
                  className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover/recent:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
