import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageMenu } from './LanguageMenu.tsx';
import { ThemeMenu } from './ThemeMenu.tsx';

export function Header({ onHome }: { onHome: () => void }) {
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
        </div>
      </div>
    </header>
  );
}
