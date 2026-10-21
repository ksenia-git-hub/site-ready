import { LogOut, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LanguageMenu } from './LanguageMenu.tsx';
import { ThemeMenu } from './ThemeMenu.tsx';

/** onLogout is given only when the server has a password and the user is logged in. */
export function Header({ onHome, onLogout }: { onHome: () => void; onLogout?: () => void }) {
  const { t } = useTranslation();

  return (
    <header className="no-print sticky top-0 z-40 border-b bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <button type="button" onClick={onHome} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <ShieldCheck className="size-4" />
          </span>
          {t('app.name')}
        </button>

        <div className="flex items-center gap-1">
          <ThemeMenu />
          <LanguageMenu />
          {onLogout && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onLogout} aria-label={t('auth.logout')}>
                  <LogOut />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('auth.logout')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </header>
  );
}
