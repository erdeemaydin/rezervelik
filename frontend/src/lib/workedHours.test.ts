import { describe, it, expect } from 'vitest';
import { windowMinutes, computeWorked, formatHM, workedTone } from './workedHours';

describe('workedHours', () => {
  it('windowMinutes handles same-day and overnight shifts', () => {
    expect(windowMinutes('08:00', '16:00')).toBe(480);
    expect(windowMinutes('22:00', '06:00')).toBe(480); // wraps past midnight
  });

  it('computeWorked prefers a real entry, else scheduled minus the break', () => {
    const scheduled = computeWorked('08:00', '16:00', null, 30);
    expect(scheduled.source).toBe('SCHEDULED');
    expect(scheduled.minutes).toBe(450); // 480 - 30 break

    const actual = computeWorked('08:00', '16:00', { checkIn: '08:00', checkOut: '16:00', breakMinutes: 15 }, 30);
    expect(actual.source).toBe('ENTRY');
    expect(actual.minutes).toBe(465); // real window 480 - entry break 15
  });

  it('formatHM renders H:MM', () => {
    expect(formatHM(450)).toBe('7:30');
    expect(formatHM(0)).toBe('0:00');
    expect(formatHM(-90)).toBe('-1:30');
  });

  it('workedTone classifies over / under / ok', () => {
    expect(workedTone(500, 480)).toBe('over');
    expect(workedTone(450, 480)).toBe('under');
    expect(workedTone(480, 480)).toBe('ok');
  });
});
