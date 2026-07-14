/**
 * 動画の再生時間バッジ（"10:23" / "1:02:03"）のパースとフィルタ判定。
 * 数字とコロンのみで locale 非依存。DOM には触れない純粋関数。
 */

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** "M:SS" / "H:MM:SS" を秒に。不正なら null（LIVE・空など） */
export function parseDurationText(text: string | null | undefined): number | null {
  if (typeof text !== 'string') {
    return null;
  }
  const m = TIME_RE.exec(text.trim());
  if (!m) {
    return null;
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] !== undefined ? Number(m[3]) : null;
  if (b > 59 || (c !== null && c > 59)) {
    return null;
  }
  return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
}

/**
 * seconds が [min, max] に収まるか。min/max は「分」。0 は境界なし。
 * 上限は以内（≤）。seconds===null（時間不明）は常に除外。
 */
export function passesDurationFilter(
  seconds: number | null,
  minMinutes: number,
  maxMinutes: number,
): boolean {
  if (seconds === null || !Number.isFinite(seconds)) {
    return false;
  }
  const min = Math.max(0, Number(minMinutes) || 0) * 60;
  const max = Math.max(0, Number(maxMinutes) || 0) * 60;
  if (min > 0 && seconds < min) {
    return false;
  }
  if (max > 0 && seconds > max) {
    return false;
  }
  return true;
}
