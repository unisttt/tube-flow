import { describe, it, expect } from 'vitest';
import { dayKey, normalizeRecord, formatMinutes } from '../../lib/usage';

describe('dayKey', () => {
  it('formats local date as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 6, 13))).toBe('2026-07-13');
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('normalizeRecord', () => {
  const today = '2026-07-13';
  it('keeps same-day seconds (floored)', () => {
    expect(normalizeRecord({ date: today, seconds: 90.9 }, today)).toEqual({ date: today, seconds: 90 });
  });
  it('resets when the date differs', () => {
    expect(normalizeRecord({ date: '2026-07-12', seconds: 999 }, today)).toEqual({ date: today, seconds: 0 });
  });
  it('resets on missing/invalid input', () => {
    expect(normalizeRecord(undefined, today)).toEqual({ date: today, seconds: 0 });
    expect(normalizeRecord({ date: today, seconds: -5 }, today)).toEqual({ date: today, seconds: 0 });
  });
});

describe('formatMinutes', () => {
  it('formats under an hour', () => {
    expect(formatMinutes(59)).toBe('0分');
    expect(formatMinutes(90)).toBe('1分');
    expect(formatMinutes(59 * 60)).toBe('59分');
  });
  it('formats an hour or more', () => {
    expect(formatMinutes(60 * 60)).toBe('1時間0分');
    expect(formatMinutes(61 * 60)).toBe('1時間1分');
  });
});
