(function (global) {
  const api = {
    clampCursor(cursor, totalTiles, visibleCount) {
      const total = Math.max(0, Number(totalTiles) || 0);
      if (total === 0) {
        return 0;
      }
      const normalizedVisible = Math.max(0, Number(visibleCount) || 0);
      let maxCursor;
      if (normalizedVisible > 0) {
        maxCursor = Math.max(0, total - normalizedVisible);
      } else {
        maxCursor = Math.max(0, total - 1);
      }
      const nextCursor = Math.min(Math.max(0, Math.floor(Number(cursor) || 0)), maxCursor);
      return nextCursor;
    },

    computeEffectiveVisibleCount(settings, tempRevealUntil, now = Date.now()) {
      const base = Math.max(0, Number(settings?.visibleCount) || 0);
      const temporaryCount = Math.max(0, Number(settings?.temporaryRevealCount) || 0);
      if (!temporaryCount) {
        return base;
      }
      if (typeof tempRevealUntil === 'number' && now < tempRevealUntil) {
        return Math.max(base, temporaryCount);
      }
      return base;
    },

    computeVisibleBounds(cursorIndex, visibleCount) {
      const cursor = Math.max(0, Math.floor(Number(cursorIndex) || 0));
      const count = Math.max(0, Number(visibleCount) || 0);
      return {
        start: cursor,
        end: cursor + count
      };
    },

    shouldRequestExit(skipCount, threshold) {
      const count = Math.max(0, Number(skipCount) || 0);
      const limit = Math.max(0, Number(threshold) || 0);
      if (!limit) {
        return false;
      }
      return count >= limit;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.TubeFlowCoreUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
