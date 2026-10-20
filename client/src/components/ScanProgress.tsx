import { useState } from 'react';
import { Check, Image, Link2, Loader2, Rocket, ScanSearch, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScanProgress as Progress } from '@qa/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const STEPS = [
  { step: 'starting', icon: Rocket },
  { step: 'pages', icon: ScanSearch },
  { step: 'links', icon: Link2 },
  { step: 'images', icon: Image },
] as const;

/** Rough share of the total time each step takes, for the overall bar. */
const WEIGHTS = { starting: [0, 5], pages: [5, 60], links: [60, 90], images: [90, 100] } as const;

interface Props {
  /** Stops the scan (wrong address, changed mind). */
  onStop: () => Promise<void>;
  url: string;
  progress: Progress | null;
}

export function ScanProgress({ url, progress, onStop }: Props) {
  const { t } = useTranslation();
  const [stopping, setStopping] = useState(false);
  const stop = async () => {
    setStopping(true);
    await onStop();
    setStopping(false);
  };
  const current = progress ?? { step: 'queued' as const };
  const currentIndex = STEPS.findIndex((item) => item.step === current.step);

  let percent = 0;
  if (current.step !== 'queued') {
    const [from, to] = WEIGHTS[current.step];
    const ratio = current.total ? (current.done ?? 0) / current.total : 0;
    percent = Math.round(from + (to - from) * ratio);
  }

  return (
    <div className="hero-glow">
      <section className="mx-auto max-w-2xl px-4 py-16 sm:py-24" aria-live="polite">
        <Card className="gap-6 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Loader2 className="size-6 animate-spin" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">{t('progress.title')}</h2>
              <p className="truncate font-mono text-sm text-muted-foreground">{url}</p>
            </div>
            <span className="ml-auto text-2xl font-semibold text-primary tabular-nums">{percent}%</span>
          </div>

          <ProgressBar value={percent} className="h-2" />

          <ol className="grid grid-cols-4 gap-2">
            {STEPS.map(({ step, icon: Icon }, index) => {
              const done = currentIndex > index;
              const active = currentIndex === index;
              return (
                <li key={step} className="flex flex-col items-center gap-2 text-center">
                  <span
                    className={cn(
                      'grid size-9 place-items-center rounded-full border transition-colors',
                      done && 'border-success/40 bg-success/10 text-success',
                      active && 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30',
                      !done && !active && 'text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <span className={cn('text-xs', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                    {t(`progress.stepNames.${step}`)}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
            <p className="font-medium">{t(`progress.steps.${current.step}`, { done: current.done, total: current.total })}</p>
            {current.url && <p className="truncate font-mono text-xs text-muted-foreground">{current.url}</p>}
          </div>

          <div className="flex flex-col items-center gap-3">
            <p className="text-center text-xs text-muted-foreground">{t('progress.hint')}</p>
            <Button variant="outline" onClick={stop} disabled={stopping} className="text-critical hover:text-critical">
              {stopping ? <Loader2 className="animate-spin" /> : <Square className="fill-current" />}
              {t('progress.cancel')}
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
