# 再生時間フィルタ ＆ スキップ済み非表示 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームのカードを「再生時間(min/max)」と「一度スキップした動画(リセットまで)」で絞り込めるようにする。

**Architecture:** 既存の「全タイル → カーソルで先頭N件表示」の手前に絞り込みを1段挟む。純粋関数 3 モジュール（duration / video-id / dismissed store）を追加し、`home.ts` は `eligible = tiles.filter(通過)` を計算してカーソルを eligible に適用する。設定は既存 `Settings` を拡張。UI はポップアップ/オプションに追加。

**Tech Stack:** WXT, TypeScript, vitest（jsdom）, Playwright（拡張を読み込む永続コンテキスト）。

## Global Constraints

- パッケージマネージャは pnpm。型チェック `pnpm compile`（`tsc --noEmit`）、ユニット `pnpm test`、E2E `pnpm test:e2e`（`@live` 除外）、ビルド `pnpm build`。
- `tsconfig` は `noUncheckedIndexedAccess` 相当が有効（配列/正規表現添字は `undefined` を考慮。`!` かガードを付ける）。
- 日付キーは `lib/usage.ts` の `dayKey(Date): 'YYYY-MM-DD'` を再利用する（重複実装しない）。
- 既定値: `durationFilterEnabled=false`, `durationMinMinutes=0`, `durationMaxMinutes=0`, `hideSkippedEnabled=false`（すべて追加時 OFF で挙動不変）。
- `0` は「境界なし」を意味する（min=0 下限なし・max=0 上限なし）。上限は**以内（≤, inclusive）**。
- 時間不明カード（LIVE 等, パース不可）はフィルタ有効時に**除外**。
- コメント/UI 文言は日本語。既存コードのスタイル（コメント密度・命名）に合わせる。

---

### Task 1: `lib/duration.ts`（純粋関数）

**Files:**
- Create: `lib/duration.ts`
- Test: `tests/unit/duration.test.ts`

**Interfaces:**
- Produces:
  - `parseDurationText(text: string | null | undefined): number | null` — `"10:23"→623`, `"1:02:03"→3723`, 不正/`"LIVE"`→`null`
  - `passesDurationFilter(seconds: number | null, minMinutes: number, maxMinutes: number): boolean` — `seconds===null` は常に `false`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/duration.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseDurationText, passesDurationFilter } from '../../lib/duration';

describe('parseDurationText', () => {
  it('parses M:SS and H:MM:SS to seconds', () => {
    expect(parseDurationText('3:20')).toBe(200);
    expect(parseDurationText(' 12:00 ')).toBe(720);
    expect(parseDurationText('45:00')).toBe(2700);
    expect(parseDurationText('1:02:03')).toBe(3723);
  });
  it('returns null for non-duration text', () => {
    expect(parseDurationText('LIVE')).toBeNull();
    expect(parseDurationText('ライブ')).toBeNull();
    expect(parseDurationText('')).toBeNull();
    expect(parseDurationText(null)).toBeNull();
    expect(parseDurationText('10:99')).toBeNull(); // 秒が不正
  });
});

describe('passesDurationFilter', () => {
  it('null (時間不明) は常に除外', () => {
    expect(passesDurationFilter(null, 0, 10)).toBe(false);
  });
  it('max のみ（以内・境界含む）', () => {
    expect(passesDurationFilter(600, 0, 10)).toBe(true); // ちょうど10分
    expect(passesDurationFilter(601, 0, 10)).toBe(false);
    expect(passesDurationFilter(200, 0, 10)).toBe(true);
  });
  it('min のみ（以上・境界含む）', () => {
    expect(passesDurationFilter(1200, 20, 0)).toBe(true); // ちょうど20分
    expect(passesDurationFilter(1199, 20, 0)).toBe(false);
  });
  it('両方 0 は全通過', () => {
    expect(passesDurationFilter(5, 0, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test -- duration`
Expected: FAIL（`Cannot find module '../../lib/duration'`）

- [ ] **Step 3: 実装**

`lib/duration.ts`:
```ts
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
```

- [ ] **Step 4: 通過を確認**

Run: `pnpm test -- duration`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/duration.ts tests/unit/duration.test.ts
git commit -m "feat: 再生時間バッジのパースとフィルタ判定（純粋関数）"
```

---

### Task 2: `lib/video-id.ts`（純粋関数）

**Files:**
- Create: `lib/video-id.ts`
- Test: `tests/unit/video-id.test.ts`

**Interfaces:**
- Produces: `parseVideoId(href: string | null | undefined): string | null`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/video-id.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseVideoId } from '../../lib/video-id';

describe('parseVideoId', () => {
  it('extracts v from relative and absolute /watch URLs', () => {
    expect(parseVideoId('/watch?v=abc123')).toBe('abc123');
    expect(parseVideoId('https://www.youtube.com/watch?v=abc123&t=10s')).toBe('abc123');
    expect(parseVideoId('/watch?list=PL1&v=xyz')).toBe('xyz');
  });
  it('extracts id from /shorts URLs', () => {
    expect(parseVideoId('/shorts/short99')).toBe('short99');
  });
  it('returns null when there is no video id', () => {
    expect(parseVideoId('/feed/subscriptions')).toBeNull();
    expect(parseVideoId('')).toBeNull();
    expect(parseVideoId(null)).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test -- video-id`
Expected: FAIL（モジュール未定義）

- [ ] **Step 3: 実装**

`lib/video-id.ts`:
```ts
/** カードのリンク href から動画 ID を取り出す純粋関数。取得不可なら null。 */
export function parseVideoId(href: string | null | undefined): string | null {
  if (typeof href !== 'string' || !href) {
    return null;
  }
  try {
    const url = new URL(href, 'https://www.youtube.com');
    if (url.pathname === '/watch') {
      const v = url.searchParams.get('v');
      return v && /^[\w-]{1,24}$/.test(v) ? v : null;
    }
    const shorts = url.pathname.match(/^\/shorts\/([\w-]{1,24})$/);
    return shorts ? shorts[1]! : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 通過を確認**

Run: `pnpm test -- video-id`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/video-id.ts tests/unit/video-id.test.ts
git commit -m "feat: カードリンクから動画IDを抽出する純粋関数"
```

---

### Task 3: `lib/dismissed.ts`（スキップ済みストア）

**Files:**
- Create: `lib/dismissed.ts`
- Test: `tests/unit/dismissed.test.ts`

**Interfaces:**
- Consumes: `dayKey` from `lib/usage.ts`
- Produces:
  - `DISMISSED_KEY = 'tubeflow-dismissed'`
  - `interface DismissedRecord { date: string; ids: string[] }`
  - `normalizeDismissed(raw: unknown, today: string): DismissedRecord`
  - `interface DismissedStore { has(id): boolean; count(): number; add(ids: string[]): void; reset(): void; load(): Promise<void>; flush(): Promise<void>; destroy(): void }`
  - `createDismissedStore(now?: () => Date, onExternalChange?: () => void): DismissedStore`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/dismissed.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DISMISSED_KEY,
  normalizeDismissed,
  createDismissedStore,
} from '../../lib/dismissed';

type ChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  area: string,
) => void;

const g = globalThis as unknown as { chrome?: unknown };
let listeners: ChangeListener[] = [];
let store: Record<string, unknown> = {};

beforeEach(() => {
  listeners = [];
  store = {};
  g.chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
      },
      onChanged: {
        addListener: (cb: ChangeListener) => listeners.push(cb),
        removeListener: (cb: ChangeListener) => {
          listeners = listeners.filter((l) => l !== cb);
        },
      },
    },
  };
});
afterEach(() => {
  delete g.chrome;
});

describe('normalizeDismissed', () => {
  const today = '2026-07-14';
  it('keeps same-day unique ids', () => {
    expect(normalizeDismissed({ date: today, ids: ['a', 'a', 'b'] }, today)).toEqual({
      date: today,
      ids: ['a', 'b'],
    });
  });
  it('resets on different day or invalid', () => {
    expect(normalizeDismissed({ date: '2026-07-13', ids: ['a'] }, today)).toEqual({
      date: today,
      ids: [],
    });
    expect(normalizeDismissed(undefined, today)).toEqual({ date: today, ids: [] });
  });
});

describe('createDismissedStore', () => {
  it('add/has/count and daily roll clears', () => {
    let now = new Date(2026, 6, 14, 10, 0);
    const s = createDismissedStore(() => now);
    s.add(['a', 'b', 'a']);
    expect(s.has('a')).toBe(true);
    expect(s.count()).toBe(2);
    now = new Date(2026, 6, 15, 0, 0); // 翌日
    expect(s.count()).toBe(0);
    expect(s.has('a')).toBe(false);
    s.destroy();
  });

  it('reset clears ids', () => {
    const s = createDismissedStore(() => new Date(2026, 6, 14, 10, 0));
    s.add(['a']);
    s.reset();
    expect(s.count()).toBe(0);
    s.destroy();
  });

  it('onChanged: union merge same-day, and adopt on shrink (reset from other tab)', () => {
    const onExternal = vi.fn();
    const s = createDismissedStore(() => new Date(2026, 6, 14, 10, 0), onExternal);
    s.add(['a']);
    // 別タブが b を足した → union
    listeners.forEach((l) =>
      l({ [DISMISSED_KEY]: { newValue: { date: '2026-07-14', ids: ['b'] } } }, 'local'),
    );
    expect(s.has('a')).toBe(true);
    expect(s.has('b')).toBe(true);
    // 別タブがリセット（空）→ 縮んだので採用
    listeners.forEach((l) =>
      l({ [DISMISSED_KEY]: { newValue: { date: '2026-07-14', ids: [] } } }, 'local'),
    );
    expect(s.count()).toBe(0);
    expect(onExternal).toHaveBeenCalled();
    s.destroy();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test -- dismissed`
Expected: FAIL（モジュール未定義）

- [ ] **Step 3: 実装**

`lib/dismissed.ts`:
```ts
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
      // 別日、または縮んだ（＝他所でリセット/削除）→ そのまま採用
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
```

- [ ] **Step 4: 通過を確認**

Run: `pnpm test -- dismissed`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/dismissed.ts tests/unit/dismissed.test.ts
git commit -m "feat: スキップ済み動画IDの日次ストア（tubeflow-dismissed）"
```

---

### Task 4: `lib/settings.ts` に設定を追加

**Files:**
- Modify: `lib/settings.ts`
- Test: `tests/unit/settings.test.ts`

**Interfaces:**
- Produces（`Settings` に追加）: `durationFilterEnabled: boolean`, `durationMinMinutes: number`, `durationMaxMinutes: number`, `hideSkippedEnabled: boolean`

- [ ] **Step 1: 失敗するテストを追記**

`tests/unit/settings.test.ts` の `describe('sanitizeSettings', ...)` 内に追加:
```ts
  it('adds and clamps duration filter + hideSkipped fields', () => {
    const result = sanitizeSettings({
      durationFilterEnabled: 'yes',
      durationMinMinutes: 5,
      durationMaxMinutes: 9999,
      hideSkippedEnabled: 1,
    });
    expect(result.durationFilterEnabled).toBe(true);
    expect(result.durationMinMinutes).toBe(5);
    expect(result.durationMaxMinutes).toBe(600); // max にクランプ
    expect(result.hideSkippedEnabled).toBe(true);
  });

  it('defaults new fields to OFF/0', () => {
    const result = sanitizeSettings({});
    expect(result.durationFilterEnabled).toBe(false);
    expect(result.durationMinMinutes).toBe(0);
    expect(result.durationMaxMinutes).toBe(0);
    expect(result.hideSkippedEnabled).toBe(false);
  });
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test -- settings`
Expected: FAIL（`durationFilterEnabled` が `undefined`）

- [ ] **Step 3: 実装**

`lib/settings.ts` の `Settings` インターフェースに追加（`hideShorts` の後あたり）:
```ts
  // ── ホームの絞り込み ──
  /** 再生時間フィルタを有効にするか */
  durationFilterEnabled: boolean;
  /** 再生時間の下限（分。0 で下限なし） */
  durationMinMinutes: number;
  /** 再生時間の上限（分。0 で上限なし。以内=inclusive） */
  durationMaxMinutes: number;
  /** 一度「次へ」でスキップした動画をリセットまで隠すか */
  hideSkippedEnabled: boolean;
```

`DEFAULTS` に追加:
```ts
  durationFilterEnabled: false,
  durationMinMinutes: 0,
  durationMaxMinutes: 0,
  hideSkippedEnabled: false,
```

`LIMITS` に追加:
```ts
  durationMinMinutes: { min: 0, max: 600 },
  durationMaxMinutes: { min: 0, max: 600 },
```

`sanitizeSettings` の返却オブジェクトに追加:
```ts
    durationFilterEnabled: Boolean(raw.durationFilterEnabled ?? DEFAULTS.durationFilterEnabled),
    durationMinMinutes: clampNumber(
      raw.durationMinMinutes,
      LIMITS.durationMinMinutes.min,
      LIMITS.durationMinMinutes.max,
      DEFAULTS.durationMinMinutes,
    ),
    durationMaxMinutes: clampNumber(
      raw.durationMaxMinutes,
      LIMITS.durationMaxMinutes.min,
      LIMITS.durationMaxMinutes.max,
      DEFAULTS.durationMaxMinutes,
    ),
    hideSkippedEnabled: Boolean(raw.hideSkippedEnabled ?? DEFAULTS.hideSkippedEnabled),
```

- [ ] **Step 4: 通過を確認**

Run: `pnpm test -- settings && pnpm compile`
Expected: PASS / 型エラーなし

- [ ] **Step 5: コミット**

```bash
git add lib/settings.ts tests/unit/settings.test.ts
git commit -m "feat: 再生時間フィルタ/スキップ済み非表示の設定を追加"
```

---

### Task 5: `lib/adapters.ts` に DOM リーダを追加

**Files:**
- Modify: `lib/adapters.ts`
- Test: `tests/unit/adapters.test.ts`（新規）

**Interfaces:**
- Consumes: `parseDurationText`（Task 1）, `parseVideoId`（Task 2）
- Produces:
  - `home.durationBadge: readonly string[]`, `home.videoLink: readonly string[]`（`home` オブジェクトに追加）
  - `readTileDuration(tile: Element): number | null`
  - `readTileVideoId(tile: Element): string | null`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/adapters.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readTileDuration, readTileVideoId } from '../../lib/adapters';

function tileHtml(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild!;
}

describe('readTileDuration', () => {
  it('reads the time badge text as seconds', () => {
    const tile = tileHtml(`
      <ytd-rich-item-renderer>
        <a href="/watch?v=x"></a>
        <ytd-thumbnail-overlay-time-status-renderer><span id="text"> 12:00 </span></ytd-thumbnail-overlay-time-status-renderer>
      </ytd-rich-item-renderer>`);
    expect(readTileDuration(tile)).toBe(720);
  });
  it('returns null when no parseable badge (LIVE)', () => {
    const tile = tileHtml(`
      <ytd-rich-item-renderer>
        <ytd-thumbnail-overlay-time-status-renderer><span id="text">ライブ</span></ytd-thumbnail-overlay-time-status-renderer>
      </ytd-rich-item-renderer>`);
    expect(readTileDuration(tile)).toBeNull();
  });
});

describe('readTileVideoId', () => {
  it('reads the video id from the first watch link', () => {
    const tile = tileHtml(`<ytd-rich-item-renderer><a href="/watch?v=abc"></a></ytd-rich-item-renderer>`);
    expect(readTileVideoId(tile)).toBe('abc');
  });
  it('returns null without a watch link', () => {
    const tile = tileHtml(`<ytd-rich-item-renderer><a href="/feed"></a></ytd-rich-item-renderer>`);
    expect(readTileVideoId(tile)).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test -- adapters`
Expected: FAIL（`readTileDuration` 未エクスポート）

- [ ] **Step 3: 実装**

`lib/adapters.ts` 冒頭の import に追加:
```ts
import { parseDurationText } from './duration';
import { parseVideoId } from './video-id';
```

`home` オブジェクトに 2 つの候補セレクタを追加（`shortsShelves` の後、閉じ `} as const;` の前）:
```ts
  /** サムネイルの再生時間バッジ（新旧レイアウト併記。実 DOM で要確認） */
  durationBadge: [
    'ytd-thumbnail-overlay-time-status-renderer #text',
    'ytd-thumbnail-overlay-time-status-renderer',
    'thumbnail-overlay-badge-view-model .badge-shape-wiz__text',
    'badge-shape .badge-shape-wiz__text',
    '.ytThumbnailOverlayBadgeViewModelHost .badge-shape-wiz__text',
  ],
  /** カードの動画リンク（先頭一致を採用） */
  videoLink: ['a#thumbnail[href]', 'a[href*="watch?v="]', 'a[href^="/watch"]', 'a[href^="/shorts/"]'],
```

ファイル末尾に DOM リーダを追加:
```ts
/** タイル内の時間バッジをパースして秒で返す。無ければ null（＝時間不明）。 */
export function readTileDuration(tile: Element): number | null {
  for (const selector of home.durationBadge) {
    for (const el of Array.from(tile.querySelectorAll(selector))) {
      const seconds = parseDurationText(el.textContent);
      if (seconds !== null) {
        return seconds;
      }
    }
  }
  return null;
}

/** タイルの先頭 watch リンクから動画 ID を返す。無ければ null。 */
export function readTileVideoId(tile: Element): string | null {
  for (const selector of home.videoLink) {
    for (const el of Array.from(tile.querySelectorAll(selector))) {
      const id = parseVideoId(el.getAttribute('href'));
      if (id) {
        return id;
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: 通過を確認**

Run: `pnpm test -- adapters && pnpm compile`
Expected: PASS / 型エラーなし

- [ ] **Step 5: コミット**

```bash
git add lib/adapters.ts tests/unit/adapters.test.ts
git commit -m "feat: タイルから再生時間・動画IDを読むDOMリーダを追加"
```

---

### Task 6: `home.ts` に絞り込み・スキップ非表示・空状態を統合

**Files:**
- Modify: `lib/content/home.ts`
- Modify: `lib/content/content.css`（空状態メッセージ）
- Test: `tests/unit/controllers.test.ts`

**Interfaces:**
- Consumes: `passesDurationFilter`（Task 1）, `readTileDuration`/`readTileVideoId`（Task 5）
- Produces（`HomeDeps` に追加）: `isDismissed: (id: string) => boolean`, `dismiss: (ids: string[]) => void`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/controllers.test.ts` に、まず先頭の `mountHome` ヘルパ付近を確認（既存）。新しい describe を追加。既存 `settings()` ヘルパは `sanitizeSettings` ベースなので新フィールドも既定で入る前提。もし `settings()` が固定オブジェクトを返す実装なら、そのオブジェクトに `durationFilterEnabled/durationMinMinutes/durationMaxMinutes/hideSkippedEnabled` の既定を含める。

再生時間バッジ付きのタイルを作るヘルパと 2 つのテストを追加:
```ts
function mountHomeWithDurations(durations: Array<string | null>): void {
  setUrl('https://www.youtube.com/');
  const cards = durations
    .map((d, i) => {
      const badge = d === null ? '' : `<ytd-thumbnail-overlay-time-status-renderer><span id="text">${d}</span></ytd-thumbnail-overlay-time-status-renderer>`;
      return `<ytd-rich-item-renderer><a href="/watch?v=v${i}">${i}</a>${badge}</ytd-rich-item-renderer>`;
    })
    .join('');
  document.body.innerHTML = `<ytd-rich-grid-renderer><div id="contents">${cards}</div></ytd-rich-grid-renderer>`;
}

function visibleHrefs(): string[] {
  return Array.from(document.querySelectorAll('ytd-rich-item-renderer.tf-visible a[href]')).map(
    (a) => a.getAttribute('href')!,
  );
}

describe('home filtering', () => {
  it('duration max=10 shows only videos <=10min, hides LIVE', () => {
    mountHomeWithDurations(['3:20', '12:00', '45:00', null, '8:00']); // v0,v4 <=10min
    const home = createHomeController({
      getSettings: () =>
        settings({ visibleCount: 6, durationFilterEnabled: true, durationMinMinutes: 0, durationMaxMinutes: 10 }),
      onState: () => {},
      onSkip: () => {},
      isDismissed: () => false,
      dismiss: () => {},
    });
    home.apply('test');
    expect(visibleHrefs()).toEqual(['/watch?v=v0', '/watch?v=v4']);
    home.destroy();
  });

  it('hideSkipped: next() dismisses the visible card and it stays hidden', () => {
    mountHomeWithDurations(['3:20', '4:00', '5:00']);
    const dismissedSet = new Set<string>();
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 1, hideSkippedEnabled: true }),
      onState: () => {},
      onSkip: () => {},
      isDismissed: (id) => dismissedSet.has(id),
      dismiss: (ids) => ids.forEach((id) => dismissedSet.add(id)),
    });
    home.apply('test');
    expect(visibleHrefs()).toEqual(['/watch?v=v0']);
    home.next(); // v0 をスキップ → dismiss
    home.apply('after-skip');
    expect(dismissedSet.has('v0')).toBe(true);
    expect(visibleHrefs()).toEqual(['/watch?v=v1']);
    home.destroy();
  });
});
```

既存テストの `createHomeController({...})` 呼び出しはすべて `isDismissed`/`dismiss` が必須になるため、**全既存呼び出しに** `isDismissed: () => false, dismiss: () => {},` を追加する（`requestExit`→`onSkip` 移行のときと同じ要領。ファイル内の全 `createHomeController(` を対象）。

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test -- controllers`
Expected: FAIL（型エラー or フィルタ未実装で `visibleHrefs` 不一致）

- [ ] **Step 3: 実装**

`lib/content/home.ts`:

(a) import に追加:
```ts
import { passesDurationFilter } from '../duration';
import { readTileDuration, readTileVideoId } from '../adapters';
```

(b) `HomeDeps` に追加:
```ts
  /** 動画 ID がスキップ済みか */
  isDismissed: (id: string) => boolean;
  /** 動画 ID 群をスキップ済みに追加する（永続化は呼び出し側） */
  dismiss: (ids: string[]) => void;
```

(c) `tiles` 宣言の近くに eligible を追加:
```ts
  let eligible: Element[] = [];
```

(d) eligible 計算関数を追加（`effectiveVisibleCount` の近く）:
```ts
  /** 再生時間フィルタ・スキップ済みで候補を絞る。両方無効なら素通し。 */
  function computeEligible(list: Element[]): Element[] {
    const s = deps.getSettings();
    const durOn = s.durationFilterEnabled && (s.durationMinMinutes > 0 || s.durationMaxMinutes > 0);
    const skipOn = s.hideSkippedEnabled;
    if (!durOn && !skipOn) {
      return list;
    }
    return list.filter((tile) => {
      if (durOn && !passesDurationFilter(readTileDuration(tile), s.durationMinMinutes, s.durationMaxMinutes)) {
        return false;
      }
      if (skipOn) {
        const id = readTileVideoId(tile);
        if (id && deps.isDismissed(id)) {
          return false;
        }
      }
      return true;
    });
  }
```

(e) `apply()` のタイル可視化ブロックを差し替える。現在の
```ts
    const visibleCount = effectiveVisibleCount();
    cursorIndex = clampCursor(cursorIndex, tiles.length, visibleCount);
    const bounds = computeVisibleBounds(cursorIndex, visibleCount);
    ...
    tiles.forEach((tile, index) => { ... });
```
を次に置き換える:
```ts
    eligible = computeEligible(tiles);

    const visibleCount = effectiveVisibleCount();
    cursorIndex = clampCursor(cursorIndex, eligible.length, visibleCount);
    const bounds = computeVisibleBounds(cursorIndex, visibleCount);

    container.classList.add(ROOT_MANAGED_CLASS);
    html().style.setProperty('--tf-card-width', `${Math.max(0, Number(settings.cardWidth) || 0)}px`);

    const eligibleSet = new Set(eligible);
    // 非適格タイルは常に隠す
    for (const tile of tiles) {
      tile.setAttribute(TILE_ATTR, '1');
      if (!eligibleSet.has(tile)) {
        tile.classList.remove('tf-visible', CARD_CLASS);
        tile.classList.add('tf-hidden');
        removeCardActions(tile);
      }
    }
    // 適格タイルはカーソル窓のみ表示
    eligible.forEach((tile, index) => {
      const shouldShow = visibleCount > 0 && index >= bounds.start && index < bounds.end;
      tile.classList.toggle('tf-visible', shouldShow);
      tile.classList.toggle('tf-hidden', !shouldShow);
      tile.classList.toggle(CARD_CLASS, shouldShow);
      if (shouldShow) {
        ensureCardActions(tile);
      } else {
        removeCardActions(tile);
      }
    });

    setFlag('tf-empty', eligible.length === 0);
```
（注: この差し替えでは元の `container.classList.add` / `setProperty` を再掲しているので、元ブロックにあった同じ 2 行は重複しないよう置換範囲に含めること。）

(f) `getCurrentTile()` を eligible ベースに:
```ts
  function getCurrentTile(): Element | null {
    if (!enabled() || !eligible.length) {
      return null;
    }
    const index = clampCursor(cursorIndex, eligible.length, effectiveVisibleCount());
    return eligible[index] ?? null;
  }
```

(g) `next()` を差し替え:
```ts
  function next(): void {
    if (!enabled() || !isHomePage()) {
      return;
    }
    const s = deps.getSettings();
    if (s.hideSkippedEnabled) {
      // 表示中の適格カードをスキップ済みにして隠す。カーソルは据え置き。
      const vc = effectiveVisibleCount();
      const start = clampCursor(cursorIndex, eligible.length, vc);
      const bounds = computeVisibleBounds(start, vc);
      const ids: string[] = [];
      for (let i = bounds.start; i < bounds.end && i < eligible.length; i++) {
        const id = readTileVideoId(eligible[i]!);
        if (id) {
          ids.push(id);
        }
      }
      deps.dismiss(ids);
      scheduleApply('skip-hide');
    } else {
      cursorIndex += Math.max(1, effectiveVisibleCount());
      scheduleApply('cursor-change');
    }
    deps.onSkip();
    emit();
  }
```

(h) `teardown()` の `setFlag('tf-ready', false);` の近くに追加:
```ts
    setFlag('tf-empty', false);
```
また `apply()` の非ホーム/無効パスや空タイル teardown 後も `tf-empty` が残らないこと（teardown で false にするので OK）。`eligible = []` も teardown 内でクリア:
```ts
    eligible = [];
```

`lib/content/content.css` に空状態メッセージを追加（`/* ===== WATCH ===== */` の直前など home セクション末尾）:
```css
/* 絞り込みで表示できるカードが 0 件のときの案内 */
html.tf-home.tf-empty .tf-managed-root::after {
  content: '条件に合う動画がありません（ポップアップでリセット／条件変更できます）';
  display: block;
  padding: 40px 16px;
  text-align: center;
  color: var(--yt-spec-text-secondary, #aaa);
  font-size: 1.4rem;
}
```

- [ ] **Step 4: 通過を確認**

Run: `pnpm test -- controllers && pnpm compile`
Expected: PASS / 型エラーなし

- [ ] **Step 5: コミット**

```bash
git add lib/content/home.ts lib/content/content.css tests/unit/controllers.test.ts
git commit -m "feat: ホームに再生時間フィルタ・スキップ済み非表示・空状態を統合"
```

---

### Task 7: content script で dismissed ストアを配線

**Files:**
- Modify: `entrypoints/youtube.content.ts`

**Interfaces:**
- Consumes: `createDismissedStore`（Task 3）, home の `isDismissed`/`dismiss` deps（Task 6）

- [ ] **Step 1: 実装（配線なので compile とビルドで検証）**

`entrypoints/youtube.content.ts`:

import 追加:
```ts
import { createDismissedStore } from '../lib/dismissed';
```

`usage` 生成の近くに追加:
```ts
    // スキップ済み動画ストア（storage.local, 日次リセット）。外部変更（リセット）で再描画。
    const dismissed = createDismissedStore(undefined, () => applyAll('dismissed-changed'));
```
（`applyAll` は後方で定義されている関数。`createDismissedStore` はコールバックを保持するだけで即時呼ばないため、`applyAll` の巻き上げ（関数宣言）で参照可能。もし `applyAll` が `const` 関数式なら、この行を `applyAll` 定義より後ろに移すこと。）

`createHomeController({...})` に deps 追加:
```ts
      isDismissed: (id) => dismissed.has(id),
      dismiss: (ids) => {
        dismissed.add(ids);
        void dismissed.flush();
      },
```

`usage.load()` の近くで dismissed もロードして再描画:
```ts
    void dismissed.load().then(() => {
      applyAll('dismissed-loaded');
    });
```

クリーンアップがあれば（`window.addEventListener('pagehide'...)` 等、既存の破棄処理箇所）に `dismissed.destroy()` を追加。無ければ追加不要。

- [ ] **Step 2: 型・ビルド確認**

Run: `pnpm compile && pnpm build`
Expected: エラーなし、`.output/chrome-mv3` 生成

- [ ] **Step 3: コミット**

```bash
git add entrypoints/youtube.content.ts
git commit -m "feat: content script にスキップ済みストアを配線"
```

---

### Task 8: ポップアップ UI（設定＋リセットボタン）

**Files:**
- Modify: `entrypoints/popup/index.html`
- Modify: `entrypoints/popup/main.ts`
- Modify: `entrypoints/popup/style.css`

**Interfaces:**
- Consumes: `DISMISSED_KEY`（Task 3）, 新設定フィールド（Task 4）

- [ ] **Step 1: HTML にフィールドを追加**

`entrypoints/popup/index.html` の `watchVisibleCount` の `</label>` の後、`<hr class="sep" />` の前に追加:
```html
        <label class="toggle" for="durationFilterEnabled">
          <input type="checkbox" id="durationFilterEnabled" name="durationFilterEnabled" />
          <span>再生時間でフィルタ</span>
        </label>

        <label class="field" for="durationMinMinutes">
          <span class="label">最短（分・0で無し）</span>
          <span class="controls">
            <button type="button" class="step" data-target="durationMinMinutes" data-step="-5" aria-label="最短を減らす">-</button>
            <input type="number" id="durationMinMinutes" name="durationMinMinutes" min="0" max="600" step="5" />
            <button type="button" class="step" data-target="durationMinMinutes" data-step="5" aria-label="最短を増やす">+</button>
          </span>
        </label>

        <label class="field" for="durationMaxMinutes">
          <span class="label">最長（分・0で無し）</span>
          <span class="controls">
            <button type="button" class="step" data-target="durationMaxMinutes" data-step="-5" aria-label="最長を減らす">-</button>
            <input type="number" id="durationMaxMinutes" name="durationMaxMinutes" min="0" max="600" step="5" />
            <button type="button" class="step" data-target="durationMaxMinutes" data-step="5" aria-label="最長を増やす">+</button>
          </span>
        </label>

        <label class="toggle" for="hideSkippedEnabled">
          <input type="checkbox" id="hideSkippedEnabled" name="hideSkippedEnabled" />
          <span>スキップした動画を隠す</span>
        </label>

        <button type="button" class="secondary" id="reset-skipped">スキップ済みを表示に戻す</button>
```

- [ ] **Step 2: main.ts を更新**

`entrypoints/popup/main.ts`:

import に `DISMISSED_KEY`, `dayKey`（既存 import 済み）を利用:
```ts
import { DISMISSED_KEY } from '../../lib/dismissed';
```

`NUMERIC_FIELDS` と `BOOLEAN_FIELDS` を拡張:
```ts
const NUMERIC_FIELDS = ['visibleCount', 'cardWidth', 'watchVisibleCount', 'durationMinMinutes', 'durationMaxMinutes'] as const;
```
```ts
const BOOLEAN_FIELDS = ['enabled', 'hideShorts', 'scheduleBlockEnabled', 'dailyLimitEnabled', 'durationFilterEnabled', 'hideSkippedEnabled'] as const;
```

`applySettingsToForm` に追加:
```ts
  field<HTMLInputElement>('durationFilterEnabled').checked = settings.durationFilterEnabled;
  field<HTMLInputElement>('durationMinMinutes').value = String(settings.durationMinMinutes);
  field<HTMLInputElement>('durationMaxMinutes').value = String(settings.durationMaxMinutes);
  field<HTMLInputElement>('hideSkippedEnabled').checked = settings.hideSkippedEnabled;
```

リセットボタン取得（他の `getElementById` の近く）:
```ts
const resetSkippedButton = document.getElementById('reset-skipped') as HTMLButtonElement;
```

スキップ済み件数の表示更新とリセット処理:
```ts
async function renderSkippedCount(): Promise<void> {
  try {
    const today = dayKey(new Date());
    const rec = (await chrome.storage.local.get(DISMISSED_KEY))[DISMISSED_KEY] as
      | { date?: string; ids?: string[] }
      | undefined;
    const count = rec && rec.date === today && Array.isArray(rec.ids) ? rec.ids.length : 0;
    resetSkippedButton.textContent = `スキップ済みを表示に戻す（${count}件）`;
    resetSkippedButton.disabled = count === 0;
  } catch {
    resetSkippedButton.textContent = 'スキップ済みを表示に戻す';
  }
}

async function handleResetSkipped(): Promise<void> {
  try {
    const today = dayKey(new Date());
    await chrome.storage.local.set({ [DISMISSED_KEY]: { date: today, ids: [] } });
    await renderSkippedCount();
    showStatus('スキップ済みをリセットしました');
  } catch {
    showStatus('リセットに失敗しました', true);
  }
}
```

`init()` の末尾でボタンを配線＆件数描画:
```ts
  resetSkippedButton.addEventListener('click', () => void handleResetSkipped());
  await renderSkippedCount();
```

- [ ] **Step 3: style.css（任意の間隔調整）**

`entrypoints/popup/style.css` に追加:
```css
#reset-skipped {
  width: 100%;
  margin-top: 4px;
}
#reset-skipped:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 4: 型・ビルド確認**

Run: `pnpm compile && pnpm build`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add entrypoints/popup/
git commit -m "feat: ポップアップに再生時間フィルタ/スキップ非表示/リセットを追加"
```

---

### Task 9: オプション UI（設定＋サマリ）

**Files:**
- Modify: `entrypoints/options/index.html`
- Modify: `entrypoints/options/main.ts`

**Interfaces:**
- Consumes: 新設定フィールド（Task 4）

- [ ] **Step 1: HTML にフィールドを追加**

`entrypoints/options/index.html` の「表示制御」fieldset 内（`hideShorts` の field の後）に追加:
```html
        <div class="field">
          <label class="check">
            <input type="checkbox" id="durationFilterEnabled" name="durationFilterEnabled" />
            再生時間でフィルタする
          </label>
          <small>指定した再生時間の動画だけをホームに表示します（0 は境界なし・時間不明の LIVE 等は除外）。</small>
        </div>
        <div class="field">
          <label for="durationMinMinutes">最短（分）
            <input type="number" id="durationMinMinutes" name="durationMinMinutes" min="0" max="600" />
          </label>
        </div>
        <div class="field">
          <label for="durationMaxMinutes">最長（分）
            <input type="number" id="durationMaxMinutes" name="durationMaxMinutes" min="0" max="600" />
          </label>
        </div>
        <div class="field">
          <label class="check">
            <input type="checkbox" id="hideSkippedEnabled" name="hideSkippedEnabled" />
            スキップした動画をリセットまで隠す
          </label>
          <small>「次へ」でスキップした動画を再表示しません。毎日 0 時に自動リセット。手動リセットはポップアップから。</small>
        </div>
```
（`class="check"` が既存に無ければ、他のチェックボックス field の書式に合わせる。上の `<label>` 直書きでも可。）

- [ ] **Step 2: main.ts を更新**

`entrypoints/options/main.ts`:

`renderSummary` の `entries` に追加:
```ts
    ['再生時間フィルタ', settings.durationFilterEnabled
      ? `${settings.durationMinMinutes || 0}〜${settings.durationMaxMinutes || '∞'}分`
      : '無効'],
    ['スキップ済みを隠す', settings.hideSkippedEnabled ? '有効' : '無効'],
```

`applySettingsToForm` に追加:
```ts
  field<HTMLInputElement>('durationFilterEnabled').checked = settings.durationFilterEnabled;
  field<HTMLInputElement>('durationMinMinutes').value = String(settings.durationMinMinutes);
  field<HTMLInputElement>('durationMaxMinutes').value = String(settings.durationMaxMinutes);
  field<HTMLInputElement>('hideSkippedEnabled').checked = settings.hideSkippedEnabled;
```

`handleSave` の `raw` に追加:
```ts
    durationFilterEnabled: field<HTMLInputElement>('durationFilterEnabled').checked,
    durationMinMinutes: Number(field<HTMLInputElement>('durationMinMinutes').value),
    durationMaxMinutes: Number(field<HTMLInputElement>('durationMaxMinutes').value),
    hideSkippedEnabled: field<HTMLInputElement>('hideSkippedEnabled').checked,
```

- [ ] **Step 3: 型・ビルド確認**

Run: `pnpm compile && pnpm build`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add entrypoints/options/
git commit -m "feat: オプションに再生時間フィルタ/スキップ非表示を追加"
```

---

### Task 10: E2E（フィクスチャ拡充＋3 シナリオ）

**Files:**
- Modify: `tests/fixtures/youtube-home.html`
- Modify: `tests/e2e/tube-flow.spec.ts`

**Interfaces:**
- Consumes: ビルド済み拡張（Task 7〜9）, `seedStorage`（既存）

- [ ] **Step 1: フィクスチャに再生時間バッジを付ける**

`tests/fixtures/youtube-home.html` の各 `ytd-rich-item-renderer` に時間バッジを追加。カード 0〜4 に順に `3:20 / 12:00 / 45:00 / ライブ / 8:00` を割り当てる。例（card 0）:
```html
              <ytd-rich-item-renderer data-id="0">
                <yt-lockup-view-model>
                  <a href="/watch?v=0">動画 0</a>
                  <ytd-thumbnail-overlay-time-status-renderer><span id="text">3:20</span></ytd-thumbnail-overlay-time-status-renderer>
                  <button aria-label="その他の操作">⋮</button>
                </yt-lockup-view-model>
              </ytd-rich-item-renderer>
```
card 1→`12:00`, card 2→`45:00`, card 3→`ライブ`, card 4→`8:00` を同様に追加。

- [ ] **Step 2: E2E テストを追加**

`tests/e2e/tube-flow.spec.ts` の `Tube Flow settings propagation` describe 内に追加。冒頭付近に共通ヘルパ（ファイル内で未定義なら）:
```ts
  const visibleVideoIds = (page: import('@playwright/test').Page) =>
    page.$$eval('ytd-rich-item-renderer.tf-visible a[href^="/watch"]', (els) =>
      els.map((e) => new URL(e.getAttribute('href')!, location.origin).searchParams.get('v')),
    );
```
テスト本体:
```ts
  test('duration filter: max=10 shows only <=10min videos, hides LIVE', async ({ context, extensionId }) => {
    await seedStorage(context, extensionId, {
      visibleCount: 6,
      durationFilterEnabled: true,
      durationMinMinutes: 0,
      durationMaxMinutes: 10,
    });
    await stubYouTube(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');
    expect(await visibleVideoIds(page)).toEqual(['0', '4']); // 3:20 と 8:00 のみ
  });

  test('duration filter: min=20 shows only >=20min videos', async ({ context, extensionId }) => {
    await seedStorage(context, extensionId, {
      visibleCount: 6,
      durationFilterEnabled: true,
      durationMinMinutes: 20,
      durationMaxMinutes: 0,
    });
    await stubYouTube(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');
    expect(await visibleVideoIds(page)).toEqual(['2']); // 45:00 のみ
  });

  test('hideSkipped: 次へ dismisses a video and it stays hidden after reload; reset restores', async ({
    context,
    extensionId,
  }) => {
    await seedStorage(context, extensionId, { visibleCount: 1, hideSkippedEnabled: true });
    await stubYouTube(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');
    expect(await visibleVideoIds(page)).toEqual(['0']);

    // 次へ → v0 をスキップ → v1 が出る
    await page.locator('.tf-controls button[data-action="next"]').click();
    await expect
      .poll(async () => (await visibleVideoIds(page))[0])
      .toBe('1');

    // リロードしても v0 は戻らない
    await page.reload();
    await page.waitForSelector('html.tf-home.tf-ready');
    expect((await visibleVideoIds(page))[0]).toBe('1');

    // ポップアップでリセット → v0 が戻る
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('#reset-skipped').click();
    await popup.close();
    await expect.poll(async () => (await visibleVideoIds(page))[0]).toBe('0');
  });
```

- [ ] **Step 3: ビルドして E2E 実行**

Run: `pnpm build && pnpm test:e2e`
Expected: 追加 3 件を含め全 PASS（既存テストも維持。既定でフィルタ OFF のため既存挙動は不変）

- [ ] **Step 4: コミット**

```bash
git add tests/fixtures/youtube-home.html tests/e2e/tube-flow.spec.ts
git commit -m "test: 再生時間フィルタ/スキップ非表示のE2E（フィクスチャに時間バッジ追加）"
```

---

### Task 11: ドキュメント更新

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: README を更新**

「主な機能」に 2 項目追加:
```md
- **再生時間フィルタ**: ホームのカードを再生時間で絞り込みます（`durationMinMinutes`〜`durationMaxMinutes` 分。0 は境界なし・上限は以内）。「10 分以内が見たい」「20 分以上が見たい」を切り替え可能。時間バッジの無い LIVE・配信予定などは有効時に除外します。
- **スキップした動画を隠す**: 一度「次へ」でスキップした動画を、リセットするまでホームに再表示しません（リロード・開き直しでも復活しない）。毎日 0 時に自動リセット。手動リセットはポップアップから。`chrome.storage.local`（`tubeflow-dismissed`）に保存。
```
設定表に 4 行追加（`durationFilterEnabled`/`durationMinMinutes`/`durationMaxMinutes`/`hideSkippedEnabled`）。

- [ ] **Step 2: CHANGELOG を更新**

`## [Unreleased]` の `### 追加（Added）` に:
```md
- **再生時間フィルタ**: ホームのカードを再生時間（最短〜最長・分）で絞り込み。時間不明カード（LIVE 等）は除外。設定 `durationFilterEnabled`/`durationMinMinutes`/`durationMaxMinutes`。
- **スキップした動画を隠す**: 「次へ」でスキップした動画をリセットまで再表示しない（`tubeflow-dismissed`, 日次自動＋ポップアップ手動リセット）。設定 `hideSkippedEnabled`。
```

- [ ] **Step 3: 最終フル検証**

Run: `pnpm compile && pnpm test && pnpm build && pnpm test:e2e`
Expected: すべて PASS

- [ ] **Step 4: コミット**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: 再生時間フィルタ/スキップ非表示を README・CHANGELOG に記載"
```

---

## 実装後の確認（任意・推奨）
- 実 YouTube に対して `durationBadge` セレクタが当たるか、ブラウザで目視／`pnpm test:e2e:live` 相当で確認。当たらなければ `lib/adapters.ts` の `home.durationBadge` を実 DOM に合わせて調整（他モジュールは変更不要）。
- ポップアップの見た目（フィルタ欄・リセットボタン）をスクリーンショットで確認。

## Self-Review 結果
- **Spec coverage**: 再生時間フィルタ(Task1,5,6,8,9,10)／スキップ済み(Task2,3,6,7,8,10)／設定(Task4)／空状態(Task6)／リセット(Task3,7,8)／時間不明除外(Task1,6)／daily+manual reset(Task3,8)／テスト(全)／docs(Task11) — 全項目に対応タスクあり。
- **Placeholder scan**: 実コード/実テストを各ステップに記載。TBD なし。
- **Type consistency**: `parseDurationText`/`passesDurationFilter`/`parseVideoId`/`readTileDuration`/`readTileVideoId`/`createDismissedStore`/`DISMISSED_KEY`/`isDismissed`/`dismiss` の名称・シグネチャはタスク間で一致。
