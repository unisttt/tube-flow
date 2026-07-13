/**
 * 設定の型・既定値・読み書き・検証・変更通知を一元管理する。
 * 旧 shared/settings.js を TypeScript 化し、境界値を型で担保する。
 */

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
}

export const DEFAULTS: Settings = {
  enabled: true,
  visibleCount: 1,
  watchVisibleCount: 0,
  hideShorts: true,
  skipCloseThreshold: 3,
};

export const LIMITS = {
  visibleCount: { min: 0, max: 6 },
  watchVisibleCount: { min: 0, max: 20 },
  skipCloseThreshold: { min: 0, max: 10 },
} as const;

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
