/**
 * カーソル・可視範囲・退出判定の純粋関数群。
 * DOM に依存しないためユニットテストで固定する。
 */

export interface VisibleBounds {
  start: number;
  end: number;
}

/** カーソルを [0, maxCursor] に収める。visibleCount>0 なら末尾 N 件が見えるよう上限を調整 */
export function clampCursor(cursor: number, totalTiles: number, visibleCount: number): number {
  const total = Math.max(0, Number(totalTiles) || 0);
  if (total === 0) {
    return 0;
  }
  const visible = Math.max(0, Number(visibleCount) || 0);
  const maxCursor = visible > 0 ? Math.max(0, total - visible) : Math.max(0, total - 1);
  const normalized = Math.floor(Number(cursor) || 0);
  return Math.min(Math.max(0, normalized), maxCursor);
}

/** カーソル位置から表示する連続範囲 [start, end) を求める */
export function computeVisibleBounds(cursorIndex: number, visibleCount: number): VisibleBounds {
  const cursor = Math.max(0, Math.floor(Number(cursorIndex) || 0));
  const count = Math.max(0, Number(visibleCount) || 0);
  return { start: cursor, end: cursor + count };
}

/** 連続スキップ数が閾値に達したか。閾値 0 は監視無効 */
export function shouldRequestExit(skipCount: number, threshold: number): boolean {
  const count = Math.max(0, Number(skipCount) || 0);
  const limit = Math.max(0, Number(threshold) || 0);
  if (!limit) {
    return false;
  }
  return count >= limit;
}
