import { describe, it, expect } from 'vitest';
import { DEFAULTS, type Settings } from '../../lib/settings';
import {
  toMinutes,
  isWindowActive,
  isScheduleBlocking,
  isDailyLimitBlocking,
  evaluateBlock,
  activeWindowEnd,
} from '../../lib/restrictions';

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULTS, ...overrides };
}

/** その日の h:m の Date */
function at(h: number, m = 0): Date {
  return new Date(2026, 0, 1, h, m);
}

describe('toMinutes', () => {
  it('parses HH:MM', () => {
    expect(toMinutes('07:30')).toBe(450);
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('23:59')).toBe(1439);
  });
  it('rejects invalid', () => {
    expect(toMinutes('25:00')).toBeNull();
    expect(toMinutes('abc')).toBeNull();
  });
});

describe('isWindowActive', () => {
  it('handles a normal same-day window [09:00,18:00)', () => {
    const w = { start: '09:00', end: '18:00' };
    expect(isWindowActive(w, 12 * 60)).toBe(true);
    expect(isWindowActive(w, 9 * 60)).toBe(true); // 開始は含む
    expect(isWindowActive(w, 18 * 60)).toBe(false); // 終了は含まない
    expect(isWindowActive(w, 8 * 60 + 59)).toBe(false);
  });

  it('handles a window crossing midnight [22:00,07:00)', () => {
    const w = { start: '22:00', end: '07:00' };
    expect(isWindowActive(w, 23 * 60)).toBe(true);
    expect(isWindowActive(w, 6 * 60)).toBe(true);
    expect(isWindowActive(w, 22 * 60)).toBe(true);
    expect(isWindowActive(w, 7 * 60)).toBe(false);
    expect(isWindowActive(w, 12 * 60)).toBe(false);
  });

  it('treats start === end as inactive', () => {
    expect(isWindowActive({ start: '10:00', end: '10:00' }, 10 * 60)).toBe(false);
  });
});

describe('isScheduleBlocking', () => {
  it('is false when disabled', () => {
    const s = settings({ scheduleBlockEnabled: false, blockWindows: [{ start: '00:00', end: '23:59' }] });
    expect(isScheduleBlocking(s, at(12))).toBe(false);
  });
  it('is true when a window covers now', () => {
    const s = settings({ scheduleBlockEnabled: true, blockWindows: [{ start: '22:00', end: '07:00' }] });
    expect(isScheduleBlocking(s, at(23))).toBe(true);
    expect(isScheduleBlocking(s, at(12))).toBe(false);
  });
});

describe('isDailyLimitBlocking', () => {
  it('is false when disabled', () => {
    expect(isDailyLimitBlocking(settings({ dailyLimitEnabled: false }), 999999)).toBe(false);
  });
  it('blocks once watched seconds reach the limit', () => {
    const s = settings({ dailyLimitEnabled: true, dailyLimitMinutes: 60 });
    expect(isDailyLimitBlocking(s, 60 * 60 - 1)).toBe(false);
    expect(isDailyLimitBlocking(s, 60 * 60)).toBe(true);
  });
});

describe('evaluateBlock', () => {
  it('prefers schedule over daily-limit', () => {
    const s = settings({
      scheduleBlockEnabled: true,
      blockWindows: [{ start: '00:00', end: '23:59' }],
      dailyLimitEnabled: true,
      dailyLimitMinutes: 5,
    });
    expect(evaluateBlock(s, 10 * 60 * 60, at(12))).toBe('schedule');
  });
  it('returns daily-limit when only the limit is exceeded', () => {
    const s = settings({ dailyLimitEnabled: true, dailyLimitMinutes: 30 });
    expect(evaluateBlock(s, 30 * 60, at(12))).toBe('daily-limit');
  });
  it('returns null when nothing blocks', () => {
    expect(evaluateBlock(settings(), 0, at(12))).toBeNull();
  });
});

describe('activeWindowEnd', () => {
  it('returns the end time of the covering window', () => {
    const s = settings({ scheduleBlockEnabled: true, blockWindows: [{ start: '22:00', end: '07:00' }] });
    expect(activeWindowEnd(s, at(23))).toBe('07:00');
  });
  it('is null when no window is active', () => {
    const s = settings({ scheduleBlockEnabled: true, blockWindows: [{ start: '09:00', end: '10:00' }] });
    expect(activeWindowEnd(s, at(12))).toBeNull();
  });
});
