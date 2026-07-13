import { describe, it, expect } from 'vitest';
import {
  DEFAULTS,
  clampNumber,
  sanitizeSettings,
  sanitizeWindows,
  normalizeHHMM,
} from '../../lib/settings';

describe('clampNumber', () => {
  it('floors and clamps within range', () => {
    expect(clampNumber(3.9, 0, 6, 1)).toBe(3);
    expect(clampNumber(99, 0, 6, 1)).toBe(6);
    expect(clampNumber(-4, 0, 6, 1)).toBe(0);
  });

  it('falls back on non-numeric input', () => {
    expect(clampNumber('abc', 0, 6, 1)).toBe(1);
    expect(clampNumber(undefined, 0, 6, 2)).toBe(2);
  });
});

describe('sanitizeSettings', () => {
  it('returns defaults for empty input', () => {
    expect(sanitizeSettings({})).toEqual(DEFAULTS);
  });

  it('clamps numeric fields to their limits', () => {
    const result = sanitizeSettings({
      visibleCount: 999,
      watchVisibleCount: -5,
      skipCloseThreshold: 100,
    });
    expect(result.visibleCount).toBe(6);
    expect(result.watchVisibleCount).toBe(0);
    expect(result.skipCloseThreshold).toBe(10);
  });

  it('coerces boolean fields', () => {
    expect(sanitizeSettings({ enabled: 0 as unknown as boolean }).enabled).toBe(false);
    expect(sanitizeSettings({ hideShorts: 1 as unknown as boolean }).hideShorts).toBe(true);
  });

  it('is defensive against non-object input', () => {
    expect(sanitizeSettings(null as never)).toEqual(DEFAULTS);
  });

  it('clamps cardWidth within range', () => {
    expect(sanitizeSettings({ cardWidth: 99999 as never }).cardWidth).toBe(1280);
    expect(sanitizeSettings({ cardWidth: 10 as never }).cardWidth).toBe(360);
    expect(sanitizeSettings({}).cardWidth).toBe(720);
  });

  it('clamps dailyLimitMinutes and coerces restriction flags', () => {
    expect(sanitizeSettings({ dailyLimitMinutes: 99999 as never }).dailyLimitMinutes).toBe(1440);
    expect(sanitizeSettings({ dailyLimitMinutes: 1 as never }).dailyLimitMinutes).toBe(5);
    expect(sanitizeSettings({ scheduleBlockEnabled: 1 as never }).scheduleBlockEnabled).toBe(true);
  });
});

describe('normalizeHHMM', () => {
  it('normalizes valid times and pads', () => {
    expect(normalizeHHMM('9:05')).toBe('09:05');
    expect(normalizeHHMM('23:59')).toBe('23:59');
  });
  it('rejects invalid times', () => {
    expect(normalizeHHMM('24:00')).toBeNull();
    expect(normalizeHHMM('12:60')).toBeNull();
    expect(normalizeHHMM('nope')).toBeNull();
    expect(normalizeHHMM(42 as never)).toBeNull();
  });
});

describe('sanitizeWindows', () => {
  it('keeps valid windows and drops invalid / zero-length ones', () => {
    const result = sanitizeWindows([
      { start: '22:00', end: '07:00' },
      { start: '10:00', end: '10:00' }, // start===end → 除外
      { start: 'bad', end: '09:00' }, // 不正 → 除外
      { start: '9:0', end: '18:00' }, // start 不正(分1桁) → 除外
    ]);
    expect(result).toEqual([{ start: '22:00', end: '07:00' }]);
  });
  it('returns [] for non-array', () => {
    expect(sanitizeWindows('x' as never)).toEqual([]);
  });
  it('caps at 12 windows', () => {
    const many = Array.from({ length: 20 }, () => ({ start: '01:00', end: '02:00' }));
    expect(sanitizeWindows(many)).toHaveLength(12);
  });
});
