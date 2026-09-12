import { cn } from '@/lib/utils';

// Rezervelik brand mark: a calendar tile (two binding rings on top) holding an
// "R" monogram whose leg runs down into a confirmation tick — "reserved ✓".
// Deliberately vertical-neutral (no fork/knife), since the platform also serves
// salons, clinics, sports, coworking and weddings.
//
// Colors are applied through `style` (not SVG presentation attributes) so CSS
// variables like `var(--admin-brand)` resolve — the same mark sits on a dark
// sidebar, a skin-colored brand bar, or the light login panel.
interface BrandMarkProps {
  size?: number;
  tile?: string;
  glyph?: string;
  className?: string;
  title?: string;
}

export function BrandMark({ size = 32, tile = 'currentColor', glyph = '#ffffff', className, title }: BrandMarkProps) {
  const stroke = { stroke: glyph };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      {/* Binding rings, then the calendar tile over their lower half. */}
      <rect x="10" y="2" width="5" height="10" rx="2.5" style={{ fill: tile }} />
      <rect x="25" y="2" width="5" height="10" rx="2.5" style={{ fill: tile }} />
      <rect x="2" y="6" width="36" height="32" rx="7" style={{ fill: tile }} />
      {/* R monogram: stem + bowl … */}
      <path d="M10.5 31V16h7a4.5 4.5 0 0 1 0 9h-7" style={stroke} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* … whose leg becomes a check tick. */}
      <path d="M16.5 25L21 30.5L30 18" style={stroke} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface BrandLogoProps extends BrandMarkProps {
  textClassName?: string;
  showWordmark?: boolean;
}

// Mark + "Rezervelik" wordmark, AdminLTE-style split weight: bold "Rezerve",
// regular "lik". The wordmark inherits `color` from its parent.
export function BrandLogo({ size = 32, tile, glyph, textClassName, showWordmark = true, className, title }: BrandLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark size={size} tile={tile} glyph={glyph} title={showWordmark ? undefined : (title ?? 'Rezervelik')} />
      {showWordmark && (
        <span className={cn('whitespace-nowrap leading-none tracking-tight', textClassName)}>
          <span className="font-extrabold">Rezerve</span><span className="font-normal">lik</span>
        </span>
      )}
    </span>
  );
}
