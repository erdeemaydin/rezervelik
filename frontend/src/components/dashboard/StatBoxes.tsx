import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowCircleRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

// AdminLTE's two signature stat widgets.
//
// Tones are a small fixed semantic/positional palette, deliberately NOT the
// tenant skin accent, and applied via inline styles so the globals.css
// `bg-blue-*` → skin remap never touches them. Each background carries its
// foreground at >= 4.5:1 (yellow uses dark text — white on AdminLTE's
// #f39c12 is only ~2:1).
export type StatTone = 'aqua' | 'green' | 'yellow' | 'red' | 'blue' | 'purple';

const TONES: Record<StatTone, { bg: string; fg: string; footer: string }> = {
  aqua: { bg: '#0277a8', fg: '#ffffff', footer: 'rgba(0,0,0,0.15)' },
  green: { bg: '#00875a', fg: '#ffffff', footer: 'rgba(0,0,0,0.15)' },
  yellow: { bg: '#f39c12', fg: '#201400', footer: 'rgba(0,0,0,0.12)' },
  red: { bg: '#c7301f', fg: '#ffffff', footer: 'rgba(0,0,0,0.15)' },
  blue: { bg: '#1f6fb2', fg: '#ffffff', footer: 'rgba(0,0,0,0.15)' },
  purple: { bg: '#605ca8', fg: '#ffffff', footer: 'rgba(0,0,0,0.15)' },
};

type IconType = React.ComponentType<{ className?: string; weight?: 'fill' | 'bold' | 'regular' }>;

interface SmallBoxProps {
  tone: StatTone;
  value: ReactNode;
  /** Small unit/suffix rendered after the number (e.g. "min"). */
  unit?: ReactNode;
  label: ReactNode;
  icon: IconType;
  /** Footer strip. With `href` it's a link ("More info →"); without, plain text. */
  footer?: ReactNode;
  href?: string;
  className?: string;
}

export function SmallBox({ tone, value, unit, label, icon: Icon, footer, href, className }: SmallBoxProps) {
  const c = TONES[tone];
  const footerContent = footer != null && (
    <span className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
      {footer}
      {href && <ArrowCircleRight weight="fill" className="h-4 w-4" />}
    </span>
  );

  return (
    <div
      data-slot="small-box"
      className={cn('group relative flex flex-col overflow-hidden rounded-[var(--radius)] shadow-[0_1px_2px_rgba(0,0,0,0.18)]', className)}
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <div className="relative z-10 flex-1 p-4 pr-24">
        <p className="text-[2.1rem] font-bold leading-none tabular-nums tracking-tight whitespace-nowrap">
          {value}
          {unit != null && <span className="ml-1.5 text-base font-semibold">{unit}</span>}
        </p>
        <p className="mt-2.5 text-sm font-semibold">{label}</p>
      </div>
      <Icon
        weight="fill"
        className="pointer-events-none absolute right-3 top-3 h-[76px] w-[76px] opacity-20 transition-transform duration-300 group-hover:scale-110"
      />
      {footerContent && (href ? (
        <Link href={href} className="relative z-10 block hover:underline" style={{ backgroundColor: c.footer, color: c.fg }}>
          {footerContent}
        </Link>
      ) : (
        <div className="relative z-10" style={{ backgroundColor: c.footer }}>{footerContent}</div>
      ))}
    </div>
  );
}

interface InfoBoxProps {
  tone: StatTone;
  label: ReactNode;
  value: ReactNode;
  icon: IconType;
  /** Optional secondary line under the number. */
  hint?: ReactNode;
  className?: string;
}

// White box with a solid colored icon square on the left.
export function InfoBox({ tone, label, value, icon: Icon, hint, className }: InfoBoxProps) {
  const c = TONES[tone];
  return (
    <div
      data-slot="info-box"
      className={cn('flex min-h-[84px] overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08)]', className)}
    >
      <div className="flex w-[76px] shrink-0 items-center justify-center" style={{ backgroundColor: c.bg, color: c.fg }}>
        <Icon weight="fill" className="h-9 w-9" />
      </div>
      <div className="flex min-w-0 flex-col justify-center px-3.5 py-2.5">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{value}</p>
        {hint != null && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
