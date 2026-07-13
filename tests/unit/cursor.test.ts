import { describe, it, expect } from 'vitest';
import { clampCursor, computeVisibleBounds, shouldRequestExit } from '../../lib/cursor';

describe('clampCursor', () => {
  it('keeps cursor inside range when visibleCount > 0', () => {
    expect(clampCursor(5, 10, 2)).toBe(5);
  });

  it('caps cursor so the last N tiles stay visible', () => {
    expect(clampCursor(9, 10, 2)).toBe(8);
  });

  it('allows cursor to reach last tile when visibleCount = 0', () => {
    expect(clampCursor(4, 5, 0)).toBe(4);
  });

  it('normalises NaN to zero', () => {
    expect(clampCursor(Number.NaN, 10, 3)).toBe(0);
  });

  it('returns 0 when there are no tiles', () => {
    expect(clampCursor(3, 0, 1)).toBe(0);
  });
});

describe('computeVisibleBounds', () => {
  it('returns [cursor, cursor + count)', () => {
    expect(computeVisibleBounds(2, 3)).toEqual({ start: 2, end: 5 });
  });

  it('handles zero count', () => {
    expect(computeVisibleBounds(4, 0)).toEqual({ start: 4, end: 4 });
  });
});

describe('shouldRequestExit', () => {
  it('is false when threshold is 0 (disabled)', () => {
    expect(shouldRequestExit(99, 0)).toBe(false);
  });

  it('is true once skipCount reaches threshold', () => {
    expect(shouldRequestExit(3, 3)).toBe(true);
    expect(shouldRequestExit(2, 3)).toBe(false);
  });
});
