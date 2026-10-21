import { useState, type FormEvent } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api.ts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiErrorText } from '@/format.ts';

/** Shown instead of the app when the server has a password (APP_PASSWORD) and this browser isn't logged in. */
export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onLoggedIn();
    } catch (loginError) {
      setError(loginError);
      setBusy(false);
    }
  };

  return (
    <div className="hero-glow">
      <section className="mx-auto max-w-sm px-4 py-20 sm:py-28">
        <Card className="gap-5 p-6">
          <div className="space-y-2 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight">{t('auth.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('auth.subtitle')}</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t('auth.password')}</span>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
                required
              />
            </label>
            {error !== null && (
              <p role="alert" className="text-sm text-critical">
                {apiErrorText(error, t)}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy || !password}>
              {busy && <Loader2 className="animate-spin" />}
              {t('auth.submit')}
            </Button>
          </form>
        </Card>
      </section>
    </div>
  );
}
