import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { CircleAlert, Loader2, ServerOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DEFAULT_MAX_PAGES, MAX_PAGES_LIMIT, type ScanJobView } from '@qa/shared';
import { UNAUTHORIZED_EVENT, api } from './api.ts';
import { Header } from './components/Header.tsx';
import { Home } from './components/Home.tsx';
import { Login } from './components/Login.tsx';
import { ScanProgress } from './components/ScanProgress.tsx';
import { apiErrorText, scanFailureText } from './format.ts';
import { clearRecentScans, loadRecentScans, removeRecentScan, saveRecentScan, type RecentScan } from './lib/recent-scans.ts';
import { qualityScore } from './lib/score.ts';

/** Whether the scan server answers; only used to explain why scans can't start. */
type ApiState = 'checking' | 'online' | 'offline';
/** "required": the server has a password and this browser must log in first. */
type AuthState = 'checking' | 'required' | 'open' | 'loggedIn';

const POLL_INTERVAL_MS = 1500;

// The report (tabs, collapsibles, score ring...) is only downloaded once a scan finishes.
const Report = lazy(() => import('./components/Report.tsx').then((module) => ({ default: module.Report })));

export function App() {
  const { t } = useTranslation();
  const [apiState, setApiState] = useState<ApiState>('checking');
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ScanJobView | null>(null);
  // The error itself, not its text: the text is built at render time so it follows language changes.
  const [requestError, setRequestError] = useState<unknown>(null);
  const [recent, setRecent] = useState<RecentScan[]>(loadRecentScans);
  // A small server allows fewer pages per scan; it says how many in /api/session.
  const [maxPagesLimit, setMaxPagesLimit] = useState(MAX_PAGES_LIMIT);

  useEffect(() => {
    const controller = new AbortController();
    api
      .session(controller.signal)
      .then((session) => {
        setApiState('online');
        setMaxPagesLimit(session.maxPages);
        setAuthState(!session.authRequired ? 'open' : session.authenticated ? 'loggedIn' : 'required');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setApiState('offline');
        setAuthState('open');
      });
    return () => controller.abort();
  }, []);

  // Session expired or password changed while using the app: back to the login screen.
  useEffect(() => {
    const onUnauthorized = () => {
      setAuthState('required');
      setJobId(null);
      setJob(null);
      setRequestError(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const logout = async () => {
    await api.logout().catch(() => {});
    setJobId(null);
    setJob(null);
    setRequestError(null);
    setAuthState('required');
  };

  // Poll the job until it finishes: simpler than WebSockets and plenty for scans that take a minute or two.
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const view = await api.getScan(jobId, controller.signal);
        setJob(view);
        if (view.status === 'queued' || view.status === 'running') timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (pollError) {
        if (!controller.signal.aborted) setRequestError(pollError);
      }
    };
    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId]);

  // Remember finished scans on the home page.
  useEffect(() => {
    if (job?.status !== 'done' || !job.report) return;
    const { summary, startUrl } = job.report;
    setRecent(
      saveRecentScan({
        id: job.id,
        url: startUrl,
        createdAt: job.createdAt,
        score: qualityScore(job.report),
        critical: summary.issuesBySeverity.critical,
      }),
    );
  }, [job]);

  // What the user typed, so that after stopping a scan the address is back in the field to fix it.
  const [lastInput, setLastInput] = useState('');

  const startScan = async (url: string, maxPages: number) => {
    setLastInput(url);
    setRequestError(null);
    setJob(null);
    try {
      const { id } = await api.createScan({ url, maxPages });
      setJobId(id);
      window.scrollTo({ top: 0 });
    } catch (createError) {
      setRequestError(createError);
    }
  };

  // The server keeps reports in memory: if this one is gone (restart), scan the same address again.
  const openRecent = async (scan: RecentScan) => {
    try {
      const view = await api.getScan(scan.id);
      setRequestError(null);
      setJob(view);
      setJobId(view.id);
    } catch {
      toast.info(t('recent.expired', { url: scan.url }));
      await startScan(scan.url, DEFAULT_MAX_PAGES);
    }
  };

  const reset = () => {
    setJobId(null);
    setJob(null);
    setRequestError(null);
  };

  // If the scan finished in the meantime the server refuses (409): polling then shows the report.
  const stopScan = async () => {
    if (!jobId) return;
    try {
      await api.cancelScan(jobId);
      reset();
      toast.info(t('progress.cancelled'));
    } catch {
      // Nothing to do: the next poll shows the finished report or the error.
    }
  };

  const finished = job?.status === 'done' && job.report;
  const failed = requestError !== null || job?.status === 'failed' || job?.status === 'cancelled';
  const inProgress = jobId !== null && !finished && !failed;
  const errorText = requestError !== null ? apiErrorText(requestError, t) : job?.error ? scanFailureText(job.error, t) : null;

  const alert =
    apiState === 'offline' ? (
      <Alert icon={ServerOff}>
        {t('app.apiOffline')} <code className="rounded bg-critical/10 px-1.5 py-0.5 font-mono text-xs">npm run dev</code>
      </Alert>
    ) : errorText ? (
      <Alert icon={CircleAlert}>
        <strong className="font-medium">{t('app.scanFailed')}</strong> {errorText}
      </Alert>
    ) : null;

  return (
    <div className="min-h-svh">
      <Header onHome={reset} onLogout={authState === 'loggedIn' ? logout : undefined} />
      <main>
        {authState === 'checking' ? (
          <Loader2 className="mx-auto mt-24 size-6 animate-spin text-muted-foreground" />
        ) : authState === 'required' ? (
          <Login onLoggedIn={() => setAuthState('loggedIn')} />
        ) : finished ? (
          <Suspense fallback={<Loader2 className="mx-auto mt-24 size-6 animate-spin text-muted-foreground" />}>
            <Report key={job.id} jobId={job.id} report={job.report!} createdAt={job.createdAt} onNewScan={reset} />
          </Suspense>
        ) : inProgress ? (
          <ScanProgress url={job?.url ?? ''} progress={job?.progress ?? null} onStop={stopScan} />
        ) : (
          <Home
            initialUrl={lastInput}
            onSubmit={startScan}
            maxPagesLimit={maxPagesLimit}
            disabled={apiState === 'offline'}
            recent={recent}
            onOpenRecent={openRecent}
            onRemoveRecent={(scan) => setRecent(removeRecentScan(scan.id))}
            onClearRecent={() => {
              clearRecentScans();
              setRecent([]);
            }}
            alert={alert}
          />
        )}
      </main>
    </div>
  );
}

function Alert({ icon: Icon, children }: { icon: typeof CircleAlert; children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-critical/30 bg-critical/10 p-4 text-sm text-critical">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
