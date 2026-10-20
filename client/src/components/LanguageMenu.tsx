import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// Only the three flags we need, so the build doesn't ship the whole flag-icons set.
import gbFlag from 'flag-icons/flags/4x3/gb.svg';
import itFlag from 'flag-icons/flags/4x3/it.svg';
import ruFlag from 'flag-icons/flags/4x3/ru.svg';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LANGUAGES, type Language } from '@/i18n/index.ts';

const FLAGS: Record<Language, string> = { it: itFlag, en: gbFlag, ru: ruFlag };

function Flag({ language }: { language: Language }) {
  return <img src={FLAGS[language]} alt="" className="h-3.5 w-[1.17rem] rounded-[3px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.1)]" />;
}

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const current = LANGUAGES.find((language) => language.code === i18n.resolvedLanguage) ?? LANGUAGES[1];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label={t('app.language')}>
          <Flag language={current.code} />
          <span className="hidden sm:inline">{current.label}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t('app.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((language) => (
          <DropdownMenuItem
            key={language.code}
            lang={language.code}
            onSelect={() => void i18n.changeLanguage(language.code)}
            className="gap-2.5"
          >
            <Flag language={language.code} />
            <span className="flex-1">{language.label}</span>
            {language.code === current.code && <Check className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
