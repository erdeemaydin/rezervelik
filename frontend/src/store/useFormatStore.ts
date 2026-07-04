import { create } from 'zustand';
import {
  formatDate as fmtDate,
  formatDateShort as fmtDateShort,
  formatTime as fmtTime,
  formatTimeRange as fmtTimeRange,
  timeOptions as buildTimeOptions,
  DEFAULT_SYSTEM,
  type MeasurementSystem,
} from '@/lib/format';

interface FormatState {
  // Platform-wide date/time convention chosen by the root system admin.
  // Hydrated from GET /settings in AdminLayout; defaults to METRIC until loaded.
  system: MeasurementSystem;
  setSystem: (system: MeasurementSystem) => void;
}

export const useFormatStore = create<FormatState>((set) => ({
  system: DEFAULT_SYSTEM,
  setSystem: (system) => set({ system: system === 'US' ? 'US' : 'METRIC' }),
}));

// Convenience hook: returns formatting helpers already bound to the active
// measurement system, so callers just do `const { formatDate } = useFormat()`.
export function useFormat() {
  const system = useFormatStore((s) => s.system);
  return {
    system,
    formatDate: (input: Date | string) => fmtDate(input, system),
    formatDateShort: (input: Date | string) => fmtDateShort(input, system),
    formatTime: (input: Date | string) => fmtTime(input, system),
    formatTimeRange: (start: string, end: string) => fmtTimeRange(start, end, system),
    timeOptions: (stepMinutes?: number) => buildTimeOptions(system, stepMinutes),
  };
}
