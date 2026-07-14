/**
 * 「スキップ済みで当面表示しない動画 ID」を chrome.storage.local に保持する。
 * 依存度カウント(usage)と同じ日次ロール方針。日付が変われば自動で空に。
 * 手動リセットはポップアップから storage を空にして反映（onChanged で受ける）。
 */
import { dayKey } from './usage';

export const DISMISSED_KEY = 'tubeflow-dismissed';

export interface DismissedRecord {
  date: string;
  ids: string[];
}

/** 保存レコードを今日基準で正規化（日付違い/不正は空、id は一意化） */
export function normalizeDismissed(raw: unknown, today: string): DismissedRecord {
  const rec = (raw && typeof raw === 'object' ? raw : {}) as Partial<DismissedRecord>;
  if (rec.date !== today || !Array.isArray(rec.ids)) {
    return { date: today, ids: [] };
  }
  const ids = rec.ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return { date: today, ids: Array.from(new Set(ids)) };
}

export interface DismissedStore {
  has(id: string): boolean;
  count(): number;
  add(ids: string[]): void;
  reset(): void;
  load(): Promise<void>;
  flush(): Promise<void>;
  destroy(): void;
}

export function createDismissedStore(
  now: () => Date = () => new Date(),
  onExternalChange?: () => void,
): DismissedStore {
  let current: DismissedRecord = { date: dayKey(now()), ids: [] };
  let set = new Set<string>();
  let dirty = false;

  function rollDateIfNeeded(): void {
    const today = dayKey(now());
    if (current.date !== today) {
      current = { date: today, ids: [] };
      set = new Set();
      dirty = true;
    }
  }

  async function flush(): Promise<void> {
    if (!dirty) {
      return;
    }
    dirty = false;
    try {
      await chrome.storage.local.set({ [DISMISSED_KEY]: current });
    } catch (error) {
      console.warn('[TubeFlow][dismissed] flush failed', error);
      dirty = true;
    }
  }

  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== 'local' || !changes[DISMISSED_KEY]) {
      return;
    }
    const today = dayKey(now());
    const incoming = normalizeDismissed(changes[DISMISSED_KEY].newValue, today);
    if (incoming.date !== current.date || incoming.ids.length < set.size) {
      // 別日、または縮んだ（＝他所でリセット/削除）→ そのまま採用。
      // 同日内で件数が減るのは reset() か popup のリセット書き込みだけが起点であり、
      // ローカルで溜まっていた未反映のスキップを含めて「リセット優先」で破棄するのが意図した挙動。
      // union（skip-wins）にしてしまうと、リセット直後に古いスキップが復活してしまうため変更しないこと。
      current = incoming;
      set = new Set(incoming.ids);
    } else {
      // 同日で増えた/同数 → union
      for (const id of incoming.ids) {
        set.add(id);
      }
      current = { date: current.date, ids: Array.from(set) };
    }
    onExternalChange?.();
  };

  chrome.storage.onChanged.addListener(onChanged);

  return {
    has(id: string): boolean {
      rollDateIfNeeded();
      return set.has(id);
    },
    count(): number {
      rollDateIfNeeded();
      return set.size;
    },
    add(ids: string[]): void {
      rollDateIfNeeded();
      let changed = false;
      for (const id of ids) {
        if (id && !set.has(id)) {
          set.add(id);
          changed = true;
        }
      }
      if (changed) {
        current = { date: current.date, ids: Array.from(set) };
        dirty = true;
      }
    },
    reset(): void {
      rollDateIfNeeded();
      if (set.size === 0) {
        return;
      }
      set = new Set();
      current = { date: current.date, ids: [] };
      dirty = true;
    },
    async load(): Promise<void> {
      const today = dayKey(now());
      try {
        const stored = await chrome.storage.local.get(DISMISSED_KEY);
        current = normalizeDismissed(stored[DISMISSED_KEY], today);
      } catch (error) {
        console.warn('[TubeFlow][dismissed] load failed', error);
        current = { date: today, ids: [] };
      }
      set = new Set(current.ids);
    },
    flush,
    destroy(): void {
      chrome.storage.onChanged.removeListener(onChanged);
    },
  };
}
