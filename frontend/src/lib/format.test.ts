import { describe, it, expect } from 'vitest';
import { formatDate, formatTime, formatTimeRange } from './format';

describe('format (platform date/time convention)', () => {
  it('formats numeric dates per measurement system', () => {
    expect(formatDate('2026-03-09', 'METRIC')).toBe('09/03/2026');
    expect(formatDate('2026-03-09', 'US')).toBe('03/09/2026');
  });

  it('formats time as 24h (METRIC) or 12h (US)', () => {
    expect(formatTime('14:30', 'METRIC')).toBe('14:30');
    expect(formatTime('14:30', 'US')).toBe('2:30 PM');
    expect(formatTime('00:05', 'US')).toBe('12:05 AM');
  });

  it('formats a time range', () => {
    expect(formatTimeRange('09:00', '17:00', 'METRIC')).toBe('09:00 – 17:00');
  });
});
