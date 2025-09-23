const coreUtils = require('../../content/core-utils.js');

describe('TubeFlow core utils', () => {
  describe('computeEffectiveVisibleCount', () => {
    it('uses base visibleCount when no temporary reveal', () => {
      const settings = { visibleCount: 1, temporaryRevealCount: 3 };
      const result = coreUtils.computeEffectiveVisibleCount(settings, 0, Date.now());
      expect(result).toBe(1);
    });

    it('selects larger temporary count while active', () => {
      const now = Date.now();
      const settings = { visibleCount: 1, temporaryRevealCount: 3 };
      const result = coreUtils.computeEffectiveVisibleCount(settings, now + 10_000, now);
      expect(result).toBe(3);
    });

    it('clamps negative values to zero', () => {
      const result = coreUtils.computeEffectiveVisibleCount({ visibleCount: -5, temporaryRevealCount: -10 }, Date.now() + 1000, Date.now());
      expect(result).toBe(0);
    });
  });

  describe('clampCursor', () => {
    it('keeps cursor inside range when visibleCount > 0', () => {
      const cursor = coreUtils.clampCursor(5, 10, 2);
      expect(cursor).toBe(5);
    });

    it('allows cursor to reach last tile when visibleCount = 0', () => {
      const cursor = coreUtils.clampCursor(4, 5, 0);
      expect(cursor).toBe(4);
    });

    it('normalises NaN to zero', () => {
      const cursor = coreUtils.clampCursor('not-a-number', 10, 3);
      expect(cursor).toBe(0);
    });
  });

  describe('computeVisibleBounds', () => {
    it('returns start and end indices based on cursor and count', () => {
      const bounds = coreUtils.computeVisibleBounds(2, 3);
      expect(bounds).toEqual({ start: 2, end: 5 });
    });

    it('handles zero visible count', () => {
      const bounds = coreUtils.computeVisibleBounds(4, 0);
      expect(bounds).toEqual({ start: 4, end: 4 });
    });
  });

  describe('shouldRequestExit', () => {
    it('returns false when threshold is zero', () => {
      expect(coreUtils.shouldRequestExit(5, 0)).toBe(false);
    });

    it('returns true when skipCount meets threshold', () => {
      expect(coreUtils.shouldRequestExit(3, 3)).toBe(true);
    });

    it('returns false when skipCount is below threshold', () => {
      expect(coreUtils.shouldRequestExit(1, 3)).toBe(false);
    });
  });
});
