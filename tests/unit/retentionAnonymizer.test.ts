import { describe, it, expect } from 'vitest';
import {
  selectForAnonymization,
  getCutoffDate,
  getRetentionDays,
  type RetentionCandidate,
} from '../../src/workers/retentionAnonymizer';

const day = (n: number) => new Date(`2026-01-${String(n).padStart(2, '0')}T00:00:00Z`);

describe('retention worker — selectForAnonymization (pure rule)', () => {
  // The cutoff sits between day 10 and day 20 — rows anchored before it are
  // "old", rows on/after it are "new" and must be left alone.
  const cutoff = day(15);

  it('selects only rows older than the cutoff', () => {
    const rows: RetentionCandidate[] = [
      { id: 'old-1', anchorDate: day(1), anonymizedAt: null },
      { id: 'old-2', anchorDate: day(10), anonymizedAt: null },
      { id: 'new-1', anchorDate: day(20), anonymizedAt: null },
      { id: 'new-2', anchorDate: day(31), anonymizedAt: null },
    ];

    const selected = selectForAnonymization(rows, cutoff);

    expect(selected.sort()).toEqual(['old-1', 'old-2']);
  });

  it('excludes a row exactly at the cutoff (only strictly older rows qualify)', () => {
    const rows: RetentionCandidate[] = [{ id: 'at-cutoff', anchorDate: cutoff, anonymizedAt: null }];
    expect(selectForAnonymization(rows, cutoff)).toEqual([]);
  });

  it('never re-selects a row that was already anonymized, even if old', () => {
    const rows: RetentionCandidate[] = [
      { id: 'already-done', anchorDate: day(1), anonymizedAt: day(16) },
      { id: 'still-pending', anchorDate: day(1), anonymizedAt: null },
    ];

    expect(selectForAnonymization(rows, cutoff)).toEqual(['still-pending']);
  });

  it('given a mixed set of old/new/already-anonymized rows, only the qualifying old ones are returned', () => {
    const rows: RetentionCandidate[] = [
      { id: 'a-old-pending', anchorDate: day(1), anonymizedAt: null },
      { id: 'b-old-done', anchorDate: day(2), anonymizedAt: day(20) },
      { id: 'c-new-pending', anchorDate: day(25), anonymizedAt: null },
      { id: 'd-old-pending', anchorDate: day(9), anonymizedAt: null },
      { id: 'e-new-done', anchorDate: day(28), anonymizedAt: null },
    ];

    expect(selectForAnonymization(rows, cutoff).sort()).toEqual(['a-old-pending', 'd-old-pending']);
  });

  it('returns an empty list when nothing qualifies', () => {
    const rows: RetentionCandidate[] = [
      { id: 'new-1', anchorDate: day(20), anonymizedAt: null },
      { id: 'done-1', anchorDate: day(1), anonymizedAt: day(16) },
    ];
    expect(selectForAnonymization(rows, cutoff)).toEqual([]);
  });
});

describe('retention worker — getCutoffDate / getRetentionDays', () => {
  it('computes a cutoff N days before "now"', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const cutoff = getCutoffDate(400, now);
    expect(now.getTime() - cutoff.getTime()).toBe(400 * 24 * 60 * 60 * 1000);
  });

  it('falls back to the 400-day default when RETENTION_DAYS is unset or invalid', () => {
    const original = process.env.RETENTION_DAYS;
    try {
      delete process.env.RETENTION_DAYS;
      expect(getRetentionDays()).toBe(400);

      process.env.RETENTION_DAYS = 'not-a-number';
      expect(getRetentionDays()).toBe(400);

      process.env.RETENTION_DAYS = '-5';
      expect(getRetentionDays()).toBe(400);

      process.env.RETENTION_DAYS = '0';
      expect(getRetentionDays()).toBe(400);
    } finally {
      if (original === undefined) delete process.env.RETENTION_DAYS;
      else process.env.RETENTION_DAYS = original;
    }
  });

  it('honors a valid RETENTION_DAYS override', () => {
    const original = process.env.RETENTION_DAYS;
    try {
      process.env.RETENTION_DAYS = '90';
      expect(getRetentionDays()).toBe(90);
    } finally {
      if (original === undefined) delete process.env.RETENTION_DAYS;
      else process.env.RETENTION_DAYS = original;
    }
  });
});
