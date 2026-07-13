/**
 * 利用制限の判定ロジック（純粋関数）。DOM/時計に依存させず、
 * 「現在時刻」「今日の視聴秒数」を引数で受け取ってユニットテストで固定する。
 */
import type { Settings, TimeWindow } from './settings';
import { normalizeHHMM } from './settings';

export type BlockReason = 'schedule' | 'daily-limit' | null;

/** 「HH:MM」を 0–1439 の分に変換（不正なら null） */
export function toMinutes(value: string): number | null {
  const normalized = normalizeHHMM(value);
  if (!normalized) {
    return null;
  }
  const [h, m] = normalized.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** 時間帯が nowMin に有効か。start>end は日をまたぐ（例 22:00–07:00） */
export function isWindowActive(win: TimeWindow, nowMin: number): boolean {
  const start = toMinutes(win.start);
  const end = toMinutes(win.end);
  if (start === null || end === null || start === end) {
    return false;
  }
  if (start < end) {
    return nowMin >= start && nowMin < end;
  }
  // 日またぎ: [start,24:00) ∪ [00:00,end)
  return nowMin >= start || nowMin < end;
}

export function isScheduleBlocking(settings: Settings, now: Date): boolean {
  if (!settings.scheduleBlockEnabled) {
    return false;
  }
  const nowMin = minutesOfDay(now);
  return settings.blockWindows.some((w) => isWindowActive(w, nowMin));
}

export function dailyLimitSeconds(settings: Settings): number {
  return Math.max(0, Math.floor(Number(settings.dailyLimitMinutes) || 0)) * 60;
}

export function isDailyLimitBlocking(settings: Settings, watchedSeconds: number): boolean {
  if (!settings.dailyLimitEnabled) {
    return false;
  }
  const limit = dailyLimitSeconds(settings);
  return limit > 0 && watchedSeconds >= limit;
}

/** 現在ブロックすべきか。理由（先に判定した方）を返す */
export function evaluateBlock(
  settings: Settings,
  watchedSeconds: number,
  now: Date,
): BlockReason {
  if (isScheduleBlocking(settings, now)) {
    return 'schedule';
  }
  if (isDailyLimitBlocking(settings, watchedSeconds)) {
    return 'daily-limit';
  }
  return null;
}

/** いま有効なブロック時間帯の終了時刻「HH:MM」（複数該当時は最も遅く明ける方） */
export function activeWindowEnd(settings: Settings, now: Date): string | null {
  const nowMin = minutesOfDay(now);
  const active = settings.blockWindows.filter((w) => isWindowActive(w, nowMin));
  if (!active.length) {
    return null;
  }
  // 「今から見て次に明けるまでの残り時間」が最大のものを採用
  const remaining = (win: TimeWindow): number => {
    const end = toMinutes(win.end)!;
    const diff = (end - nowMin + 1440) % 1440;
    return diff === 0 ? 1440 : diff;
  };
  return active.reduce((a, b) => (remaining(a) >= remaining(b) ? a : b)).end;
}
