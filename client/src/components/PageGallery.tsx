import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { ExternalLink, ImageOff, Monitor, MoveVertical, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { rateSpeed, type Issue, type PageMetrics, type PageSummary, type ScreenshotDevice, type SpeedRating } from '@qa/shared';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SEVERITY_STYLES } from '@/lib/visuals.ts';

interface Props {
  jobId: string;
  pages: PageSummary[];
  issues: Issue[];
}

const screenshotUrl = (jobId: string, index: number, device: ScreenshotDevice) =>
  `/api/scans/${encodeURIComponent(jobId)}/screenshots/${index}/${device}`;

const RATING_COLOR: Record<SpeedRating, string> = {
  good: 'text-success',
  needsImprovement: 'text-warning',
  poor: 'text-critical',
};

/** Desktop + phone screenshots of every analyzed page, with its problems and loading speed. */
export function PageGallery({ jobId, pages, issues }: Props) {
  const { t, i18n } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const opened = openIndex === null ? null : pages[openIndex];
  const format = useFormat(i18n.resolvedLanguage ?? 'en');

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{t('report.screenshots.title')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((page, index) => {
          const pageIssues = issues.filter((issue) => issue.pageUrl === page.url);
          const worst = (['critical', 'warning', 'info'] as const).find((severity) =>
            pageIssues.some((issue) => issue.severity === severity),
          );
          return (
            <button
              key={page.url}
              type="button"
              onClick={() => setOpenIndex(index)}
              disabled={!page.screenshots}
              aria-label={`${t('report.screenshots.open')}: ${page.url}`}
              className="group print-avoid-break overflow-hidden rounded-xl border bg-card text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-primary/40 enabled:hover:shadow-lg"
            >
              <div className="relative aspect-[1366/900] overflow-hidden border-b bg-muted">
                {page.screenshots ? (
                  <>
                    <Shot src={screenshotUrl(jobId, index, 'desktop')} className="size-full object-cover object-top" />
                    {/* Phone in the corner, like a device mock-up: the top of the full-page shot. */}
                    <div className="absolute right-2 bottom-2 w-[22%] overflow-hidden rounded-md border-2 border-foreground/80 bg-background shadow-lg">
                      <Shot src={screenshotUrl(jobId, index, 'mobile')} className="aspect-[375/812] w-full object-cover object-top" />
                    </div>
                  </>
                ) : (
                  <Unavailable />
                )}
              </div>
              <div className="flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{page.title ?? page.url}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{page.url}</p>
                  {page.metrics && <MetricsLine metrics={page.metrics} format={format} />}
                </div>
                {worst && (
                  <Badge variant="outline" className={cn('tabular-nums', SEVERITY_STYLES[worst].border, SEVERITY_STYLES[worst].text)}>
                    {pageIssues.length}
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={opened !== null} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <DialogContent className="max-h-[94svh] overflow-y-auto sm:max-w-6xl">
          {opened && openIndex !== null && (
            <>
              <DialogHeader>
                <DialogTitle>{opened.title ?? opened.url}</DialogTitle>
                <DialogDescription asChild>
                  <a href={opened.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                    {opened.url}
                    <ExternalLink className="size-3" />
                  </a>
                </DialogDescription>
              </DialogHeader>
              <ScreenshotViewer
                key={openIndex}
                desktopSrc={screenshotUrl(jobId, openIndex, 'desktop')}
                mobileSrc={screenshotUrl(jobId, openIndex, 'mobile')}
              />
              {opened.metrics && <MetricsPanel metrics={opened.metrics} format={format} />}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * A flat laptop like the minimal mock-ups of the Figma Community: thin black bezel with a notch,
 * a plain light base with the opening indent, a soft shadow. No gradients, no reflections.
 */
function LaptopMockup({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-[6%] drop-shadow-[0_24px_30px_rgb(0_0_0/0.18)]">
      <div className="relative rounded-t-[14px] bg-[#0b0b0f] p-[1.3%] ring-1 ring-black/40">
        <span className="absolute top-0 left-1/2 z-10 h-[2.6%] min-h-2.5 w-[11%] -translate-x-1/2 rounded-b-[6px] bg-[#0b0b0f]" aria-hidden="true" />
        {children}
      </div>
      <div className="relative -mx-[7%] h-3 rounded-b-[10px] bg-[#d9dbe1] dark:bg-[#8b8e97]" aria-hidden="true">
        <span className="absolute top-0 left-1/2 h-1 w-[13%] -translate-x-1/2 rounded-b-[5px] bg-[#c4c7cf] dark:bg-[#71747c]" />
      </div>
    </div>
  );
}

/**
 * A flat phone like the Figma Community mock-ups: thin dark body with a light edge, the camera
 * island the page scrolls under, discreet side buttons, a soft shadow.
 */
function PhoneMockup({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[15rem] drop-shadow-[0_24px_30px_rgb(0_0_0/0.18)]">
      <span className="absolute top-[22%] -left-[2px] h-10 w-[2px] rounded-l-sm bg-[#c4c7cf]" aria-hidden="true" />
      <span className="absolute top-[31%] -left-[2px] h-10 w-[2px] rounded-l-sm bg-[#c4c7cf]" aria-hidden="true" />
      <span className="absolute top-[27%] -right-[2px] h-16 w-[2px] rounded-r-sm bg-[#c4c7cf]" aria-hidden="true" />
      <div className="relative rounded-[2.6rem] bg-[#0b0b0f] p-[7px] ring-[1.5px] ring-[#c4c7cf] dark:ring-[#5b5e66]">
        <span
          className="pointer-events-none absolute top-[15px] left-1/2 z-10 h-[21px] w-[32%] -translate-x-1/2 rounded-full bg-[#0b0b0f]"
          aria-hidden="true"
        />
        {children}
      </div>
    </div>
  );
}

/** A Figma-like frame label: "# Phone — 375 × 812", small and grey above the frame. */
function FrameLabel({ icon: Icon, name, size }: { icon: typeof Monitor; name: string; size: string }) {
  return (
    <figcaption className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Icon className="size-3" />
      <span className="font-medium text-foreground/80">{name}</span>
      <span className="tabular-nums">{size}</span>
    </figcaption>
  );
}

/**
 * Full-page desktop and phone screenshots, each in its own scrolling frame. With "scroll together"
 * on, scrolling one frame moves the other to the same relative position (top, middle, bottom).
 */
function ScreenshotViewer({ desktopSrc, mobileSrc }: { desktopSrc: string; mobileSrc: string }) {
  const { t } = useTranslation();
  const [synced, setSynced] = useState(true);
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  // Set while we move the other frame ourselves, so its scroll event doesn't bounce back.
  const ignoreNext = useRef<HTMLDivElement | null>(null);

  const follow = (source: RefObject<HTMLDivElement | null>, target: RefObject<HTMLDivElement | null>) => () => {
    const from = source.current;
    const to = target.current;
    if (!synced || !from || !to) return;
    if (ignoreNext.current === from) {
      ignoreNext.current = null;
      return;
    }
    const ratio = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
    ignoreNext.current = to;
    to.scrollTop = ratio * (to.scrollHeight - to.clientHeight);
  };

  return (
    <div className="space-y-3">
      {/* A plain, very light stage with a hint of the brand indigo: calm next to any analyzed site. */}
      <div className="rounded-xl border bg-[oklch(0.975_0.006_275)] p-5 sm:p-8 dark:bg-[oklch(0.22_0.012_275)]">
        <div className="grid items-end gap-8 md:grid-cols-[minmax(0,1fr)_15rem]">
          <figure className="space-y-3">
            <FrameLabel icon={Monitor} name={t('report.screenshots.desktop')} size="1366 × 900" />
            <LaptopMockup>
              <div
                ref={desktopRef}
                onScroll={follow(desktopRef, mobileRef)}
                className="aspect-[16/10] overflow-y-auto overscroll-contain rounded-[3px] bg-white [scrollbar-width:thin]"
              >
                <Shot src={desktopSrc} className="block w-full" />
              </div>
            </LaptopMockup>
          </figure>
          <figure className="space-y-3">
            <FrameLabel icon={Smartphone} name={t('report.screenshots.mobile')} size="375 × 812" />
            <PhoneMockup>
              <div
                ref={mobileRef}
                onScroll={follow(mobileRef, desktopRef)}
                className="aspect-[9/19.5] overflow-y-auto overscroll-contain rounded-[2.15rem] bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <Shot src={mobileSrc} className="block w-full" />
              </div>
            </PhoneMockup>
          </figure>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-1">
          <MoveVertical className="size-3.5 shrink-0" />
          {t('report.screenshots.scrollHint')}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-foreground">
          <Checkbox checked={synced} onCheckedChange={(value) => setSynced(value === true)} />
          {t('report.screenshots.syncScroll')}
        </label>
      </div>
    </div>
  );
}

type Format = ReturnType<typeof useFormat>;

/**
 * Numbers and units in the reader's language: "1,2 с" in Russian, "1.2 s" in English.
 * Times under a second are shown in milliseconds ("90 мс"), not as "0,1 s".
 */
function useFormat(language: string) {
  const { t } = useTranslation();
  const decimal = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat(language);
  return {
    seconds: (ms: number) =>
      ms < 1000
        ? t('report.metrics.units.ms', { value: integer.format(Math.round(ms)) })
        : t('report.metrics.units.s', { value: decimal.format(ms / 1000) }),
    bytes: (bytes: number) =>
      bytes >= 1024 * 1024
        ? t('report.metrics.units.mb', { value: decimal.format(bytes / 1024 / 1024) })
        : t('report.metrics.units.kb', { value: integer.format(Math.round(bytes / 1024)) }),
    cls: (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value),
    integer: (value: number) => integer.format(value),
  };
}

/** "1,2 MB · 1,3 s" under the page title: weight and main content time, colored by rating. */
function MetricsLine({ metrics, format }: { metrics: PageMetrics; format: Format }) {
  const { t } = useTranslation();
  return (
    <p className="mt-1 flex flex-wrap gap-x-2 text-xs tabular-nums">
      <span className={RATING_COLOR[rateSpeed('bytes', metrics.bytes)]} title={t('report.metrics.weight')}>
        {format.bytes(metrics.bytes)}
      </span>
      {metrics.lcpMs !== null && (
        <span className={RATING_COLOR[rateSpeed('lcpMs', metrics.lcpMs)]} title={t('report.metrics.lcp')}>
          · {format.seconds(metrics.lcpMs)}
        </span>
      )}
    </p>
  );
}

function MetricsPanel({ metrics, format }: { metrics: PageMetrics; format: Format }) {
  const { t } = useTranslation();
  const tiles: { label: string; value: string; rating?: SpeedRating }[] = [
    { label: t('report.metrics.ttfb'), value: format.seconds(metrics.ttfbMs), rating: rateSpeed('ttfbMs', metrics.ttfbMs) },
    ...(metrics.lcpMs !== null
      ? [{ label: t('report.metrics.lcp'), value: format.seconds(metrics.lcpMs), rating: rateSpeed('lcpMs', metrics.lcpMs) }]
      : []),
    { label: t('report.metrics.cls'), value: format.cls(metrics.cls), rating: rateSpeed('cls', metrics.cls) },
    { label: t('report.metrics.load'), value: format.seconds(metrics.loadMs) },
    { label: t('report.metrics.weight'), value: format.bytes(metrics.bytes), rating: rateSpeed('bytes', metrics.bytes) },
    { label: t('report.metrics.requests'), value: format.integer(metrics.requests) },
  ];

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{t('report.metrics.title')}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border p-2.5">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="text-lg font-semibold tabular-nums">{tile.value}</p>
            {tile.rating && (
              <p className={cn('text-xs font-medium', RATING_COLOR[tile.rating])}>{t(`report.metrics.rating.${tile.rating}`)}</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('report.metrics.note')}</p>
    </section>
  );
}

/** An image that falls back to a placeholder (e.g. the server restarted and the screenshot is gone). */
function Shot({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Unavailable />;
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />;
}

function Unavailable() {
  const { t } = useTranslation();
  return (
    <div className="flex size-full min-h-24 flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
      <ImageOff className="size-5" />
      {t('report.screenshots.unavailable')}
    </div>
  );
}
