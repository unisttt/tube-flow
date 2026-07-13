/**
 * 設定の型・既定値・読み書き・検証・変更通知を一元管理する。
 * 旧 shared/settings.js を TypeScript 化し、境界値を型で担保する。
 */

/** 「HH:MM」〜「HH:MM」の時間帯（毎日適用。start>end は日をまたぐ） */
export interface TimeWindow {
  start: string;
  end: string;
}

export interface Settings {
  /** Tube Flow 全体の有効/無効 */
  enabled: boolean;
  /** ホームで常時表示する動画カード数（0 で全非表示） */
  visibleCount: number;
  /** 視聴ページ右カラムのおすすめ許可数（0 で全非表示） */
  watchVisibleCount: number;
  /** ホームの Shorts 棚を隠すか */
  hideShorts: boolean;
  /** Alt+J 連打を許容する回数（0 で監視無効） */
  skipCloseThreshold: number;

  // ── 利用制限 ──
  /** 時間帯ブロックを有効にするか */
  scheduleBlockEnabled: boolean;
  /** ブロックする時間帯（毎日適用） */
  blockWindows: TimeWindow[];
  /** 1 日の視聴時間上限を有効にするか */
  dailyLimitEnabled: boolean;
  /** 1 日の視聴時間上限（分。動画再生中の時間で計測） */
  dailyLimitMinutes: number;
}

export const DEFAULTS: Settings = {
  enabled: true,
  visibleCount: 1,
  watchVisibleCount: 0,
  hideShorts: true,
  skipCloseThreshold: 3,
  scheduleBlockEnabled: false,
  blockWindows: [],
  dailyLimitEnabled: false,
  dailyLimitMinutes: 60,
};

export const LIMITS = {
  visibleCount: { min: 0, max: 6 },
  watchVisibleCount: { min: 0, max: 20 },
  skipCloseThreshold: { min: 0, max: 10 },
  dailyLimitMinutes: { min: 5, max: 1440 },
} as const;

const HHMM = /^(\d{1,2}):(\d{2})$/;

/** 「HH:MM」文字列を正規化（不正なら null） */
export function normalizeHHMM(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const m = HHMM.exec(value.trim());
  if (!m) {
    return null;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** 時間帯配列を検証（start/end とも妥当・start≠end のものだけ残す。最大 12 件） */
export function sanitizeWindows(raw: unknown): TimeWindow[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: TimeWindow[] = [];
  for (const item of raw) {
    const start = normalizeHHMM((item as TimeWindow)?.start);
    const end = normalizeHHMM((item as TimeWindow)?.end);
    if (start && end && start !== end) {
      result.push({ start, end });
    }
    if (result.length >= 12) {
      break;
    }
  }
  return result;
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

/** 任意の入力を安全な Settings へ正規化する */
export function sanitizeSettings(raw: Partial<Record<keyof Settings, unknown>> = {}): Settings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULTS };
  }
  return {
    enabled: Boolean(raw.enabled ?? DEFAULTS.enabled),
    visibleCount: clampNumber(
      raw.visibleCount,
      LIMITS.visibleCount.min,
      LIMITS.visibleCount.max,
      DEFAULTS.visibleCount,
    ),
    watchVisibleCount: clampNumber(
      raw.watchVisibleCount,
      LIMITS.watchVisibleCount.min,
      LIMITS.watchVisibleCount.max,
      DEFAULTS.watchVisibleCount,
    ),
    hideShorts: Boolean(raw.hideShorts ?? DEFAULTS.hideShorts),
    skipCloseThreshold: clampNumber(
      raw.skipCloseThreshold,
      LIMITS.skipCloseThreshold.min,
      LIMITS.skipCloseThreshold.max,
      DEFAULTS.skipCloseThreshold,
    ),
    scheduleBlockEnabled: Boolean(raw.scheduleBlockEnabled ?? DEFAULTS.scheduleBlockEnabled),
    blockWindows: sanitizeWindows(raw.blockWindows ?? DEFAULTS.blockWindows),
    dailyLimitEnabled: Boolean(raw.dailyLimitEnabled ?? DEFAULTS.dailyLimitEnabled),
    dailyLimitMinutes: clampNumber(
      raw.dailyLimitMinutes,
      LIMITS.dailyLimitMinutes.min,
      LIMITS.dailyLimitMinutes.max,
      DEFAULTS.dailyLimitMinutes,
    ),
  };
}

export async function readSettings(): Promise<Settings> {
  try {
    const items = await chrome.storage.sync.get(DEFAULTS);
    return sanitizeSettings({ ...DEFAULTS, ...items });
  } catch (error) {
    console.warn('[TubeFlow][settings] read failed, fallback to defaults', error);
    return { ...DEFAULTS };
  }
}

export async function writeSettings(raw: Partial<Settings>): Promise<Settings> {
  const settings = sanitizeSettings(raw);
  await chrome.storage.sync.set(settings);
  return settings;
}

export async function updateSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  return writeSettings({ ...current, ...partial });
}

export function resetSettings(): Promise<Settings> {
  return writeSettings({ ...DEFAULTS });
}

/**
 * chrome.storage.sync の変更を購読し、正規化済み Settings を返す。
 * 解除関数を返す。
 */
export function watchSettings(onChange: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== 'sync') {
      return;
    }
    const touched = Object.keys(changes).some((key) => key in DEFAULTS);
    if (!touched) {
      return;
    }
    void readSettings().then(onChange);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
