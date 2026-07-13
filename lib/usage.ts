/**
 * 利用ログを chrome.storage.local に永続化する。
 * 高頻度更新かつ端末ローカルなので sync ではなく local を使う。
 *
 * 2 つの性質が異なる値を 1 レコードに持つ:
 *  - seconds: 「今日の視聴秒数」。日次上限ブロックの判定に使うので日付が変われば 0 リセット。
 *  - skipHistory: 「日付 → 次への回数」の履歴。押した回数＝依存度なのでリセットせず累積し、
 *    推移をグラフで可視化する。日を跨いでも消えない（該当日のキーへ加算されるだけ）。
 * 複数タブ間は storage.onChanged で同期する。
 */

export const USAGE_KEY = 'tubeflow-usage';

export interface UsageRecord {
  /** seconds が対象とする今日のローカル日付キー YYYY-MM-DD */
  date: string;
  /** その日の視聴秒数（日次リセット） */
  seconds: number;
  /** 日付キー → その日に「次へ」を押した回数（累積・リセットしない） */
  skipHistory: Record<string, number>;
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 保存された履歴マップを検証（日付キー・非負整数のみ採用） */
function sanitizeHistory(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (DATE_RE.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) {
        out[k] = Math.floor(v);
      }
    }
  }
  return out;
}

/**
 * 保存レコードを今日基準で正規化する。
 * seconds は「今日ぶん」だけ（日付が違えば 0）。skipHistory は日付に関係なく丸ごと保持。
 * 旧スキーマ（単日 `skips: number`）が残っていればその日の履歴へ移行する。
 */
export function normalizeRecord(raw: unknown, today: string): UsageRecord {
  const rec = (raw && typeof raw === 'object' ? raw : {}) as Partial<UsageRecord> & {
    skips?: unknown;
  };
  const seconds =
    rec.date === today && typeof rec.seconds === 'number' && rec.seconds >= 0
      ? Math.floor(rec.seconds)
      : 0;

  const skipHistory = sanitizeHistory(rec.skipHistory);
  // 旧レコード { date, seconds, skips } からの移行（履歴未登録の日付のみ）
  if (
    typeof rec.date === 'string' &&
    DATE_RE.test(rec.date) &&
    typeof rec.skips === 'number' &&
    rec.skips > 0 &&
    skipHistory[rec.date] === undefined
  ) {
    skipHistory[rec.date] = Math.floor(rec.skips);
  }

  return { date: today, seconds, skipHistory };
}

/** 累計の「次へ」回数（履歴の総和） */
export function totalSkips(record: UsageRecord): number {
  let total = 0;
  for (const v of Object.values(record.skipHistory)) {
    total += v;
  }
  return total;
}

/**
 * today から遡って days 日ぶんの回数を「古い→新しい」で返す（欠損日は 0 埋め）。
 * グラフ描画用。末尾が today。
 */
export function recentSkips(
  record: UsageRecord,
  today: string,
  days: number,
): Array<{ date: string; count: number }> {
  const n = Math.max(1, Math.floor(days));
  const parts = today.split('-').map(Number);
  const base = new Date(parts[0]!, (parts[1] ?? 1) - 1, parts[2] ?? 1);
  const out: Array<{ date: string; count: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const key = dayKey(dt);
    out.push({ date: key, count: record.skipHistory[key] ?? 0 });
  }
  return out;
}

export interface UsageTracker {
  /** 今日の視聴秒数（メモリ上の最新値） */
  seconds(): number;
  /** 今日の「次へ」押下回数 */
  skips(): number;
  /** 累計の「次へ」押下回数（全期間） */
  totalSkips(): number;
  /** 直近 days 日ぶんの回数（古い→新しい・末尾が今日） */
  history(days: number): Array<{ date: string; count: number }>;
  /** n 秒加算（メモリ加算し、必要に応じて flush） */
  add(seconds: number): void;
  /** 「次へ」押下を 1 回加算（今日の履歴へ） */
  addSkip(): void;
  /** ストレージから読み込んでメモリを初期化 */
  load(): Promise<number>;
  /** メモリ値を即ストレージへ書き出す */
  flush(): Promise<void>;
  destroy(): void;
}

export function createUsageTracker(now: () => Date = () => new Date()): UsageTracker {
  let current: UsageRecord = { date: dayKey(now()), seconds: 0, skipHistory: {} };
  let dirty = false;

  /** 日付が変わったら seconds だけ 0 に。skipHistory は保持する。 */
  function rollDateIfNeeded(): void {
    const today = dayKey(now());
    if (current.date !== today) {
      current = { ...current, date: today, seconds: 0 };
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
    const today = dayKey(now());
    const incoming = normalizeRecord(changes[USAGE_KEY].newValue, today);
    // 他タブの計測を取り込む。seconds は同日なら大きい方、履歴は日付ごとに大きい方で合流。
    const mergedHistory: Record<string, number> = { ...current.skipHistory };
    for (const [k, v] of Object.entries(incoming.skipHistory)) {
      mergedHistory[k] = Math.max(mergedHistory[k] ?? 0, v);
    }
    current = {
      date: current.date,
      seconds: current.date === today ? Math.max(current.seconds, incoming.seconds) : current.seconds,
      skipHistory: mergedHistory,
    };
  };

  chrome.storage.onChanged.addListener(onChanged);

  return {
    // 読み取り時にも日付ロールする。これがないと、日次上限で遮断中は動画が停止して
    // add() が呼ばれず、日付が変わっても秒数が上限超のままでオーバーレイが解けない。
    seconds: () => {
      rollDateIfNeeded();
      return current.seconds;
    },
    skips: () => {
      rollDateIfNeeded();
      return current.skipHistory[current.date] ?? 0;
    },
    totalSkips: () => {
      rollDateIfNeeded();
      return totalSkips(current);
    },
    history: (days: number) => {
      rollDateIfNeeded();
      return recentSkips(current, current.date, days);
    },
    add(seconds: number): void {
      rollDateIfNeeded();
      current = { ...current, seconds: current.seconds + Math.max(0, seconds) };
      dirty = true;
    },
    addSkip(): void {
      rollDateIfNeeded();
      const today = current.date;
      current = {
        ...current,
        skipHistory: { ...current.skipHistory, [today]: (current.skipHistory[today] ?? 0) + 1 },
      };
      dirty = true;
    },
    async load(): Promise<number> {
      const today = dayKey(now());
      try {
        const stored = await chrome.storage.local.get(USAGE_KEY);
        current = normalizeRecord(stored[USAGE_KEY], today);
      } catch (error) {
        console.warn('[TubeFlow][usage] load failed', error);
        current = { date: today, seconds: 0, skipHistory: {} };
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

/**
 * 日別回数を縦棒の SVG グラフ（文字列）にする。ライブラリ非依存・inline 埋め込み用。
 * 末尾（今日）は色を変えて強調。各棒に日付・回数の title を付ける。
 * data は recentSkips の戻り値（古い→新しい）を想定。
 */
export function skipChartSvg(data: Array<{ date: string; count: number }>): string {
  const W = 100;
  const H = 32;
  const gap = 1.4;
  const n = Math.max(1, data.length);
  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = (W - gap * (n - 1)) / n;
  const bars = data
    .map((d, i) => {
      const h = d.count > 0 ? Math.max(1.2, (d.count / max) * (H - 1)) : 0.6;
      const x = i * (barW + gap);
      const y = H - h;
      const today = i === data.length - 1;
      const cls = today ? 'tf-bar tf-bar-today' : 'tf-bar';
      const label = `${d.date.slice(5)}: ${d.count}回`;
      return `<rect class="${cls}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(
        2,
      )}" height="${h.toFixed(2)}" rx="0.5"><title>${label}</title></rect>`;
    })
    .join('');
  return `<svg class="tf-skipchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="直近${n}日の「次へ」回数">${bars}</svg>`;
}
