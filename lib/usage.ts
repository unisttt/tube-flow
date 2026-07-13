/**
 * 「今日の視聴秒数」を chrome.storage.local に永続化する。
 * 高頻度更新かつ端末ローカルな利用ログなので sync ではなく local を使う。
 * 日付が変われば 0 リセット。複数タブ間は storage.onChanged で同期する。
 */

export const USAGE_KEY = 'tubeflow-usage';

export interface UsageRecord {
  /** ローカル日付キー YYYY-MM-DD */
  date: string;
  /** その日の視聴秒数 */
  seconds: number;
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 保存レコードを今日基準で正規化（日付が違えば 0） */
export function normalizeRecord(raw: unknown, today: string): UsageRecord {
  const rec = raw as Partial<UsageRecord> | undefined;
  if (!rec || rec.date !== today || typeof rec.seconds !== 'number' || rec.seconds < 0) {
    return { date: today, seconds: 0 };
  }
  return { date: today, seconds: Math.floor(rec.seconds) };
}

export interface UsageTracker {
  /** 今日の視聴秒数（メモリ上の最新値） */
  seconds(): number;
  /** n 秒加算（メモリ加算し、必要に応じて flush） */
  add(seconds: number): void;
  /** ストレージから読み込んでメモリを初期化 */
  load(): Promise<number>;
  /** メモリ値を即ストレージへ書き出す */
  flush(): Promise<void>;
  destroy(): void;
}

export function createUsageTracker(now: () => Date = () => new Date()): UsageTracker {
  let current: UsageRecord = { date: dayKey(now()), seconds: 0 };
  let dirty = false;

  function rollDateIfNeeded(): void {
    const today = dayKey(now());
    if (current.date !== today) {
      current = { date: today, seconds: 0 };
      dirty = true;
    }
  }

  async function flush(): Promise<void> {
    if (!dirty) {
      return;
    }
    dirty = false;
    try {
      await chrome.storage.local.set({ [USAGE_KEY]: current });
    } catch (error) {
      console.warn('[TubeFlow][usage] flush failed', error);
      dirty = true;
    }
  }

  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== 'local' || !changes[USAGE_KEY]) {
      return;
    }
    const incoming = normalizeRecord(changes[USAGE_KEY].newValue, dayKey(now()));
    // 他タブの計測を取り込む（同日なら大きい方を採用）
    if (incoming.date === current.date && incoming.seconds > current.seconds) {
      current = incoming;
    }
  };

  chrome.storage.onChanged.addListener(onChanged);

  return {
    // 読み取り時にも日付ロールする。これがないと、日次上限で遮断中は動画が停止して
    // add() が呼ばれず、日付が変わっても秒数が上限超のままでオーバーレイが解けない。
    seconds: () => {
      rollDateIfNeeded();
      return current.seconds;
    },
    add(seconds: number): void {
      rollDateIfNeeded();
      current = { ...current, seconds: current.seconds + Math.max(0, seconds) };
      dirty = true;
    },
    async load(): Promise<number> {
      const today = dayKey(now());
      try {
        const stored = await chrome.storage.local.get(USAGE_KEY);
        current = normalizeRecord(stored[USAGE_KEY], today);
      } catch (error) {
        console.warn('[TubeFlow][usage] load failed', error);
        current = { date: today, seconds: 0 };
      }
      return current.seconds;
    },
    flush,
    destroy(): void {
      chrome.storage.onChanged.removeListener(onChanged);
    },
  };
}

/** 表示用: 秒を「N分」または「N時間M分」に整形 */
export function formatMinutes(seconds: number): string {
  const min = Math.floor(seconds / 60);
  if (min < 60) {
    return `${min}分`;
  }
  return `${Math.floor(min / 60)}時間${min % 60}分`;
}
