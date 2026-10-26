import type { AdminTheme } from '@/lib/themes';

// Miniature AdminLTE layout used by the skin pickers (tenant Settings →
// Appearance and system-admin Global Settings): logo bar + sidebar with an
// active row, top navbar, gray canvas with a white box. Shows the structural
// difference between skins, not just an accent dot.
export function ThemePreview({ swatch }: { swatch: AdminTheme['swatch'] }) {
  return (
    <div className="flex h-[72px] overflow-hidden rounded-[var(--radius)] border border-border" aria-hidden>
      <div className="flex w-[32%] flex-col" style={{ backgroundColor: swatch.sidebar }}>
        <div className="h-4 shrink-0" style={{ backgroundColor: swatch.brand }} />
        <div className="mt-2 space-y-1.5 pr-1.5">
          <div className="ml-1.5 h-1 rounded-full bg-white/30" />
          <div className="h-2 border-l-2 bg-black/25" style={{ borderLeftColor: swatch.accent }} />
          <div className="ml-1.5 h-1 rounded-full bg-white/30" />
          <div className="ml-1.5 h-1 rounded-full bg-white/30" />
        </div>
      </div>
      <div className="flex flex-1 flex-col" style={{ backgroundColor: swatch.bg }}>
        <div className="h-4 shrink-0" style={{ backgroundColor: swatch.header }} />
        <div className="flex flex-1 gap-1 p-1.5">
          <div className="flex-1 rounded-[2px] border border-[#9ca8b7] bg-white" style={{ borderTop: `2px solid ${swatch.header}` }} />
          <div className="flex-1 rounded-[2px] border border-[#9ca8b7] bg-white" />
        </div>
      </div>
    </div>
  );
}
