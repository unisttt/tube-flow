import { describe, it, expect } from 'vitest';
import { DEFAULTS, clampNumber, sanitizeSettings } from '../../lib/settings';

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
});
