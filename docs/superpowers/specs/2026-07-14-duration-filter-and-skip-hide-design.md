# 設計: 再生時間フィルタ ＆ スキップ済み非表示

- 日付: 2026-07-14
- 対象: Tube Flow（YouTube ホームのカード表示制御拡張, WXT + TypeScript）
- ステータス: 承認済み（実装計画へ）

## 概要

ホーム（`/`）のカード表示に、2 つの独立したフィルタ機能を追加する。

1. **再生時間フィルタ**: 動画の再生時間で表示対象を絞り込む（「10 分以内が見たい」「20 分以上が見たい」）。
2. **スキップ済み非表示**: 一度「次へ」でスキップした動画を、リセットするまでホームに再表示しない（リロード・開き直しでも復活しない）。

どちらも「候補タイルを絞り込むフィルタ」として実装し、既存のカーソル表示（先頭 N 件表示）の手前に 1 段挟む。

## 絞り込みパイプライン

既存の `home.ts` は「全タイル → カーソル起点で先頭 N 件表示」。ここに絞り込みを挟む:

```
全タイル(tiles)
  → 再生時間フィルタ（min/max）で除外
  → スキップ済み(dismissed)で除外
  = 適格タイル(eligible)
  → clampCursor / computeVisibleBounds で先頭 N 件だけ tf-visible
```

両機能は独立した述語（predicate）として合成する。片方だけ有効なら他方は恒真。

## 機能 A: 再生時間フィルタ

### 設定（`Settings` に追加）
- `durationFilterEnabled: boolean`（既定 `false`）
- `durationMinMinutes: number`（既定 `0`。`0` = 下限なし）
- `durationMaxMinutes: number`（既定 `0`。`0` = 上限なし）

例: 「10 分以内」= min 0 / max 10。「20 分以上」= min 20 / max 0。両方 0（かつ enabled）なら実質フィルタ無効（全件通過）。

`LIMITS`: `durationMinMinutes` / `durationMaxMinutes` とも `{ min: 0, max: 600 }`（0〜10 時間）。`sanitizeSettings` でクランプ。

### 再生時間の取得
各カードのサムネイル時間バッジ（`10:23`・`1:02:03` 形式）をパースする。数字とコロンのみで **locale 非依存**。

- DOM から候補要素を複数セレクタで集め、テキストが `/^\d+:\d{2}(:\d{2})?$/` にマッチする最初の値を採用（堅牢性のため）。
- パース: `M:SS` → `M*60+SS` 秒、`H:MM:SS` → `H*3600+MM*60+SS` 秒。
- セレクタ候補は `adapters.ts` に集約（実 DOM で要検証。新 lockup の badge-shape 系と旧 `ytd-thumbnail-overlay-time-status-renderer` を併記）。

### 時間不明カードの扱い
LIVE・配信予定（premiere）・ミックス/プレイリスト等、時間バッジが無い/パースできないカードは「時間不明」。**フィルタ有効時は除外する**（「◯分の動画が見たい」という要件に合致しないため）。フィルタ無効時は当然すべて対象。

### 純粋関数（`lib/duration.ts`）
```ts
// "10:23" -> 623, "1:02:03" -> 3723, 不正/"LIVE" -> null
export function parseDurationText(text: string | null | undefined): number | null;

// seconds が [minMin*60, maxMin*60] に収まるか（0 は「境界なし」）
export function passesDurationFilter(
  seconds: number | null,
  minMinutes: number,
  maxMinutes: number,
): boolean;
// seconds === null（時間不明）は常に false（＝除外）。
```

## 機能 B: スキップ済み非表示（リセットまで）

### 設定
- `hideSkippedEnabled: boolean`（既定 `false`）

### 動画識別子（`lib/video-id.ts`）
```ts
// "/watch?v=abc123", "https://www.youtube.com/watch?v=abc123&t=1" -> "abc123"
// 取得できなければ null
export function parseVideoId(href: string | null | undefined): string | null;
```
カードからの抽出は薄い DOM ラッパ: タイル内の `a[href*="watch?v="]`（無ければ `a[href^="/watch"]`）の href を `parseVideoId` に渡す。

### 保存（`lib/dismissed.ts`）
新ストレージキー `tubeflow-dismissed` = `{ date: 'YYYY-MM-DD', ids: string[] }`（`chrome.storage.local`）。

`usage.ts` と同じ作りのストア `createDismissedStore(now?)`:
- `load(): Promise<void>` — ストレージから復元。日付が今日と違えば空で開始。
- `has(id): boolean` — 日次ロール込み。
- `add(ids: string[]): void` — メモリ追加＋dirty。重複は Set で排除。
- `count(): number`
- `reset(): void` — ids を空にして即時永続化対象に。
- `flush(): Promise<void>` / `destroy()`
- `chrome.storage.onChanged` で他タブと **和集合** マージ（skip は増える一方なので union が自然）。
- 日次自動リセット: `has`/`count` 読み取り時にも `rollDateIfNeeded`（日付が変われば ids を空に）。

所有者は content script（`youtube.content.ts`）。load / destroy はここが行う。

### 非表示の契機
「次へ」押下時のみ。`home.next()` で:
- `hideSkippedEnabled` が **ON**: その時点の **表示中カード（tf-visible）の動画 ID** を集めて `dismissed.add(ids)` → 永続化 → 再描画。カーソルは据え置き（次の適格カードがせり上がる）。
- **OFF**: 従来どおりカーソルを N 進める。

`onSkip`（回数記録, 既存）は ON/OFF どちらでも 1 回として発火（依存度カウントは「押した回数」なので不変）。

### リセット
選択: **手動＋日次自動リセット併用**。
- 日次自動: 日付が変われば dismissed は空に（`rollDateIfNeeded`）。
- 手動: **ポップアップのリセットボタン**で即時全クリア。「やっぱり適切だった」時は手動リセットで戻す。
- ミニ UI にはリセットボタンを置かない（ポップアップのみ）。

## UI 変更

### ポップアップ（`entrypoints/popup/`）
- 再生時間フィルタ: 有効トグル＋ min / max のステッパー（分）。
- 「スキップ済みを隠す」トグル。
- **リセットボタン**（`スキップ済みを表示に戻す（◯件）`）。◯ は `dismissed.count()`。0 件のときは無効表示。

### オプション（`entrypoints/options/`）
- 同じ設定（再生時間フィルタ／スキップ済みトグル）を数値入力・チェックで。設定サマリにも追記。
- リセットボタンはポップアップのみ（オプションには置かない）。

### 右下ミニ UI（`lib/content/controls.ts` / `content.css`）
- リセットボタンは追加しない。
- **空状態**: フィルタ/非表示で適格 0 件かつ元タイルが存在するとき、管理グリッド内に小さく `条件に合う動画がありません（リセット/条件変更で戻せます）` を表示。無限リトライで空回りしないよう、`eligible === 0 && tiles > 0` は「準備完了・空」として扱う。

## データフロー / 依存

`youtube.content.ts`:
- `dismissed = createDismissedStore()` を生成し `load()`。
- `home` の deps に絞り込み用の入力を渡す:
  - `getSettings`（既存, 再生時間フィルタ設定を含む）
  - `isDismissed(id): boolean`（`dismissed.has`）
  - `dismiss(ids: string[]): void`（`dismissed.add` ＋ `flush`）
- popup のリセットは `chrome.storage.local` を直接書き換え（`{ date: today, ids: [] }`）。content 側は `onChanged` で受けて再描画。

## `home.ts` の変更点（要点）
- `computeEligible(tiles): Element[]` を追加: 各タイルについて
  - 再生時間フィルタ有効なら `passesDurationFilter(parseDurationText(badgeText), min, max)` を満たすもののみ。
  - `hideSkippedEnabled` 有効なら `!isDismissed(videoId)` のもののみ。
- `apply()`: `tiles` から `eligible` を算出し、カーソル・可視判定・カードボタンは `eligible` に対して行う。`eligible` 外のタイルは常に `tf-hidden`。
- `next()`: 上記「非表示の契機」に従い分岐。
- 空状態フラグ（`tf-empty`）のトグル。

## エッジケース
- 時間バッジのパース失敗（LIVE 等）→ 時間不明 → フィルタ有効時は除外。
- 動画 ID 取得失敗（href 無し）→ dismiss 対象にできない → そのカードは通常表示のまま（スキップしても次回残りうるが実害小）。
- min > max のような矛盾設定 → `passesDurationFilter` が単に全件 false になるだけ（空状態表示で気づける）。
- 適格 0 件 → 空状態表示、リトライ空回りなし。
- 複数タブ: dismissed は union マージ、設定は既存の同期経路。

## ファイル構成
- 新規: `lib/duration.ts`, `lib/video-id.ts`, `lib/dismissed.ts`
- 変更: `lib/settings.ts`, `lib/adapters.ts`, `lib/content/home.ts`, `lib/content/controls.ts`（必要なら）, `lib/content/content.css`, `entrypoints/youtube.content.ts`, `entrypoints/popup/*`, `entrypoints/options/*`, `README.md`, `CHANGELOG.md`

## テスト
### ユニット
- `duration.ts`: `parseDurationText`（`M:SS`, `H:MM:SS`, 不正, `LIVE`, 空）。`passesDurationFilter`（下限のみ/上限のみ/両方/両方0/境界値/null は false）。
- `video-id.ts`: `parseVideoId`（相対・絶対 URL, 余分なクエリ, 不正）。
- `dismissed.ts`: add/has、日次ロールで空になる、reset、onChanged union マージ。
- `settings.ts`: 新フィールドの既定・クランプ。

### E2E（`tests/e2e/`）
- home フィクスチャに時間バッジ（例 `3:20` / `12:00` / `45:00` ＋ `LIVE`）と一意な `href="/watch?v=...”` を付与。
- ①再生時間フィルタ: max=10 で 10 分以下のカードだけ表示・LIVE は非表示。min=20 で 20 分以上だけ表示。
- ②スキップ済み非表示: `hideSkippedEnabled` ON で「次へ」→ そのカードが消え、**リロード後も表示されない**。
- ③リセット: ポップアップのリセットで再表示される。

## スコープ外（YAGNI）
- 「クリックして見た」「興味なし」「後で見る」動画の自動非表示（今回はスキップのみ）。
- 個別動画の un-dismiss / 直前の取消（手動リセットで代替）。
- 再生時間のプリセットボタン / モード切替 UI（range で代替）。
- 視聴ページ側のフィルタ（ホームのみ対象）。
