'use client';

import { Check, X } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';
import { evaluatePassword, PASSWORD_RULE_LABEL_KEY } from '@/lib/passwordPolicy';
import { cn } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
  /** Hide the whole block until the user starts typing. */
  hideWhenEmpty?: boolean;
  className?: string;
}

// Live password-policy feedback: a strength meter plus a per-rule checklist so
// the user can see exactly which requirements are still unmet as they type.
// Uses the shared rules in lib/passwordPolicy so it can never drift from the
// server's enforcement.
export function PasswordStrength({ password, hideWhenEmpty = true, className }: PasswordStrengthProps) {
  const { t } = useTranslation();
  const { results, strength } = evaluatePassword(password);

  if (hideWhenEmpty && password.length === 0) return null;

  const bars = Math.round(strength * results.length);
  const tone =
    strength >= 1 ? 'strong' : strength >= 0.5 ? 'medium' : 'weak';
  const toneClass = {
    weak: 'bg-red-500',
    medium: 'bg-amber-500',
    strong: 'bg-emerald-500',
  }[tone];
  const toneLabel = {
    weak: t('auth.passwordStrengthWeak'),
    medium: t('auth.passwordStrengthMedium'),
    strong: t('auth.passwordStrengthStrong'),
  }[tone];

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1" aria-hidden>
          {results.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i < bars ? toneClass : 'bg-black/10'
              )}
            />
          ))}
        </div>
        <span
          className={cn(
'text-[11px] font-bold',
            tone === 'weak' && 'text-red-600',
            tone === 'medium' && 'text-amber-600',
            tone === 'strong' && 'text-emerald-600'
          )}
        >
          {toneLabel}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-1" aria-label={t('auth.passwordRequirements')}>
        {results.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full shrink-0',
                r.passed ? 'bg-emerald-100 text-emerald-600' : 'bg-black/5 text-black/30'
              )}
            >
              {r.passed ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className={cn(r.passed ? 'text-foreground/70' : 'text-muted-foreground')}>
              {t(PASSWORD_RULE_LABEL_KEY[r.id])}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
