# Tube Flow (Chrome Extension)

Tube Flow は YouTube のホーム画面と視聴ページで表示されるカード／おすすめを絞り込み、衝動的な視聴を抑えることを目的とした Manifest V3 対応の Chrome 拡張です。ホームは先頭 `visibleCount` 件だけを表示し、視聴ページのおすすめは `watchVisibleCount` 件までに制限します。キーボード・カード上の個別ボタン・ツールバーポップアップから即座に操作できます。

- **技術スタック**: [WXT](https://wxt.dev) + TypeScript（MV3）
- **対応ブラウザ**: Chrome / Chromium 系（Firefox もビルド可）
- **テスト**: Vitest（ユニット・happy-dom）+ Playwright（E2E・ビルド済み拡張をロード）

> **v0.4.0 で技術スタックを刷新しました。** 旧来の素の JS + 手書きセレクタ構成から WXT + TypeScript へ移行し、YouTube の DOM 変更（`yt-lockup-view-model` 化、視聴ページおすすめのネスト化）に強い**属性ベースの表示制御**へ作り替えています。機能要件は従来どおりです。

---

## 目次
- [主な機能](#主な機能)
- [操作方法](#操作方法)
- [設定項目](#設定項目)
- [インストール（利用者向け）](#インストール利用者向け)
- [開発](#開発)
- [アーキテクチャ](#アーキテクチャ)
- [内部仕様（コントラクト）](#内部仕様コントラクト)
- [テスト](#テスト)
- [デバッグ](#デバッグ)
- [変更履歴](#変更履歴)

---

## 主な機能
- **フォーカス表示（ホーム）**: `/` のカードを先頭 `visibleCount` 件（既定 1）のみ表示。棚（「その他のトピック」等）や Shorts、continuation もまとめてマスクし、指定枚数だけを残します。残したカードは**中央寄せ**で表示し、大きさ（幅）は `cardWidth` で調整できます。無効化中は DOM に一切手を入れず、YouTube 本来のレイアウトへ即座に戻ります。
- **おすすめ制御（視聴ページ）**: `/watch` 右カラムのおすすめを `watchVisibleCount` 件（既定 0）まで表示。0 のときはパネルごと非表示にします。再生終了後のエンドスクリーンおすすめもまとめて抑制。
- **後で見る / 興味なし（カード単位）**: 表示中の各カードに個別の「後で見る」「興味なし」ボタンをオーバーレイ表示し、対象を直接選べます（複数表示時も各カードを個別に操作可能）。新レイアウトでサムネイルのオーバーレイボタンが消えたため、内部的には「直接ボタン → 3 点メニュー経由」の順にフォールバックします。
- **Shorts 抑制**: reel/shelf ベースの Shorts セクションをホームで非表示化。
- **クイックトグル UI**: ツールバーのポップアップから有効/無効・Shorts 抑制・表示枚数をワンクリックで切替。変更は全 YouTube タブへ即時配信。
- **ページ送り**: 「次へ」は**表示枚数（`visibleCount`）ぶんをまとめて送る** 1 ページ送りです（3 枚表示なら 3 枚流れる）。回数制限はありません。
- **「次へ」回数の可視化（＝依存度）**: 「次へ」を押した回数を**日別に累積記録**します（リセットせず貫通）。押した回数はそのまま依存度なので、右下ミニ UI に**累計回数バッジ**（`累計N回`、その日の押しすぎは色で警告）、ポップアップに**直近7日の棒グラフ**＋累計/本日、オプションに**直近14日の棒グラフ**を表示します。履歴は `chrome.storage.local` に保存され、再読み込みや日をまたいでも消えません。「どれだけ YouTube に依存しているか」を推移で自覚するための機能です。
- **利用制限（使いすぎ防止）**: 指定した**時間帯**、または**1 日の視聴時間**が上限を超えたときに、全画面の遮断オーバーレイで YouTube を使えなくします。視聴時間は「/watch で動画が実際に再生されている時間」で計測し、毎日 0 時にリセット。一時解除（スヌーズ）はなく、設定を変えない限り解けません。

## 操作方法

| 操作 | キーボード | カード上ボタン / ミニ UI | 説明 |
|------|-----------|--------------------------|------|
| 次へ（ページ送り） | Alt+J | 右下ミニ UI「次へ」 | 表示枚数ぶんまとめて送る。回数無制限。累計押下回数をバッジ表示 |
| 後で見る | Alt+L（先頭カード） | 各カードの「後で見る」 | キーボードは先頭カード、マウスは各カードを個別に対象化 |
| 興味なし | Alt+Shift+I（先頭カード） | 各カードの「興味なし」 | 同上 |

> キーボードショートカットは `chrome://extensions/shortcuts` から変更できます（macOS では Alt＝Option）。

## 設定項目

| 項目 | 説明 | 既定値 | 範囲 |
|------|------|--------|------|
| `enabled` | Tube Flow 全体の有効/無効。無効化で即座に YouTube を原状復帰 | 有効 | — |
| `visibleCount` | ホームで常時表示するカード数（0 で全非表示）。「次へ」の送り幅も兼ねる | 1 | 0–6 |
| `cardWidth` | 表示カード1枚の幅（px）。中央寄せ表示の大きさ。画面幅で頭打ち | 720 | 360–1280 |
| `watchVisibleCount` | 視聴ページおすすめの最大表示数（0 でパネルごと非表示） | 0 | 0–20 |
| `hideShorts` | ホームの Shorts 棚を隠すか | 有効 | — |
| `scheduleBlockEnabled` | 時間帯ブロックの有効/無効 | 無効 | — |
| `blockWindows` | ブロックする時間帯（毎日適用・日またぎ可）。オプションで追加/削除 | `[]` | 最大12件 |
| `dailyLimitEnabled` | 1 日の視聴時間上限の有効/無効 | 無効 | — |
| `dailyLimitMinutes` | 1 日の視聴時間上限（分。動画再生中で計測） | 60 | 5–1440 |

設定は `chrome.storage.sync` に保存され、ポップアップ／オプションのどちらから変更しても全 YouTube タブへ即時反映されます。値は保存時に範囲内へクランプされます（`lib/settings.ts`）。時間帯や上限分の編集はオプション画面で行い、ポップアップでは 2 つの制限の ON/OFF と本日の視聴時間を確認できます。

**使用量の内部動作**: 端末ローカルの `chrome.storage.local`（キー `tubeflow-usage`）に `{ date, seconds, skipHistory }` を保存。`seconds`（今日の視聴秒数）は日次上限判定に使うため日付が変われば 0 リセット。`skipHistory`（日付→「次へ」回数）は依存度なのでリセットせず累積し、`recentSkips` で日別グラフに描画する。判定ロジックは `lib/restrictions.ts`（純粋関数）、計測・遮断の実行は `lib/content/blocker.ts`。ブロック中は全画面オーバーレイ `#tf-block-overlay` を表示し、再生中の動画も停止します。

## インストール（利用者向け）
1. `pnpm install && pnpm build` を実行（`.output/chrome-mv3` が生成される）。
2. `chrome://extensions/` を開きデベロッパーモードを ON。
3. 「パッケージ化されていない拡張機能を読み込む」で **`.output/chrome-mv3`** を指定。
4. YouTube を開き直すと表示が絞り込まれます。

> **読み込むフォルダはリポジトリ直下ではなく `.output/chrome-mv3`（ビルド成果物）です。** ソースを直接読み込む構成ではありません。コード更新後は再ビルドし、`chrome://extensions/` で 🔄 再読み込みします。

## 開発
```bash
pnpm install          # 依存取得（postinstall で wxt prepare が走る）
pnpm dev              # 開発モード（HMR 付き。.output/chrome-mv3-dev を読み込む）
pnpm build            # 本番ビルド → .output/chrome-mv3
pnpm zip              # 配布用 zip
pnpm compile          # 型チェック（tsc --noEmit）
pnpm test             # ユニットテスト
pnpm test:e2e         # E2E テスト（先に pnpm build が必要）
```
- 開発時は `pnpm dev` を起動したまま `.output/chrome-mv3-dev` を読み込むと、変更が自動反映されます。
- Firefox 版は `pnpm dev:firefox` / `pnpm build:firefox`。

## アーキテクチャ
```
entrypoints/
  youtube.content.ts   # コンテンツスクリプト: document_start で起動し home/watch/controls を統括
  background.ts        # MV3 service worker（コマンド仲介・request-exit でのタブクローズ）
  popup/               # ツールバーポップアップ（index.html / main.ts / style.css）
  options/             # 設定ページ（index.html / main.ts / style.css）
lib/
  settings.ts          # 設定の型・既定値・検証・読み書き・変更購読
  messaging.ts         # 型付きメッセージプロトコル・全タブ通知
  cursor.ts            # カーソル/可視範囲/退出判定の純粋関数（ユニットテスト対象）
  page.ts              # ページ種別判定（home/watch）・SPA ナビゲーション購読
  adapters.ts          # YouTube DOM セレクタの一元管理（DOM 変更時はここだけ直す）
  restrictions.ts      # 利用制限の判定ロジック（時間帯/上限。純粋関数）
  usage.ts             # 1日の視聴秒数を storage.local に永続化（日次リセット・タブ間同期）
  content/
    home.ts            # ホームの表示制御コントローラ（カーソル・ページ送り・個別ボタン）
    watch.ts           # 視聴ページのおすすめ制御コントローラ
    actions.ts         # 後で見る/興味なし（直接ボタン→メニュー経由フォールバック）
    controls.ts        # 右下ミニ UI（「次へ」）
    blocker.ts         # 利用制限の実行（視聴計測・遮断オーバーレイ #tf-block-overlay）
    content.css        # tf-* 名前空間のスタイル（属性ベースで表示制御）
tests/
  unit/                # Vitest + happy-dom
  e2e/                 # Playwright（ビルド済み拡張ロード）
  fixtures/            # 実 DOM を模した静的 HTML
```

**データフロー概要**
1. `youtube.content.ts` が `document_start` で起動し、URL からマスク用 `tf-*` クラスを即時付与（フリッカー防止）。
2. `chrome.storage.sync` から設定を読み、`home`/`watch` コントローラが `MutationObserver` で DOM を監視して表示制御。
3. キーボードコマンドは `background.ts` が受け、対象タブの content へ転送。ポップアップ/オプションの変更は `messaging.ts` が全タブへ通知。
4. 「次へ」の連続がしきい値に達すると content が `request-exit` を送り、`background.ts` がタブを閉じる。

## 内部仕様（コントラクト）

DOM 変更に強くするため、表示制御は **`<html>` のフラグクラス × タイルの属性/クラス** で行い、ネスト深度に依存しません。

**`<html>` に付くフラグクラス**

| クラス | 意味 |
|--------|------|
| `tf-home` | ホーム表示中かつ有効 |
| `tf-watch` | 視聴ページ表示中かつ有効 |
| `tf-ready` | ホームの制御適用済み（適用前は全カードをプリマスク） |
| `tf-watch-ready` | 視聴ページの制御適用済み |
| `tf-hide-shorts` | Shorts 抑制が有効 |
| `tf-watch-hide-all` | `watchVisibleCount=0`：おすすめパネルごと非表示 |
| `tf-managed-root` | 管理下のグリッド `#contents`。直下のタイル以外を一括マスク |

**タイルに付く属性/クラス**

| 印 | 対象 | 意味 |
|----|------|------|
| `data-tf-tile` | ホームのカード | Tube Flow の管理対象タイル |
| `data-tf-rec` | 視聴ページのおすすめ | 同（おすすめ 1 件） |
| `.tf-visible` / `.tf-hidden` | 上記タイル | 表示 / 非表示 |
| `.tf-card` | 表示中カード | 個別ボタンを重ねる基点（`position: relative`） |
| `.tf-card-actions` / `[data-tf-action]` | カード上ボタン | 後で見る/興味なしの個別ボタン |

**メッセージプロトコル**（`lib/messaging.ts`。すべて `source: "tube-flow"`）

| type | 方向 | 用途 |
|------|------|------|
| `command-next` / `command-watch-later` / `command-not-interested` | background → content | ショートカット実行 |
| `options-updated` | popup/options → content | 設定変更の即時反映 |
| `request-exit` | content → background | スキップ上限到達でタブを閉じる |

## テスト
```bash
pnpm test             # ユニット（Vitest + happy-dom）
pnpm test:e2e         # E2E（ビルド済み拡張ロード + ローカル静的フィクスチャ。決定的・オフライン）
pnpm test:e2e:live    # ライブ E2E（本物の youtube.com に対して実行。要ネットワーク）
```
テストは 3 層:
- **ユニット**: 純粋関数（`cursor` / `settings` / `restrictions` / `usage`）に加え、コントローラを happy-dom 上のフィクスチャで駆動。回帰として **視聴ページおすすめのネスト構造**、**ホームの棚/セクションのマスク**、**スキップ上限での停止**、**後で見る/興味なしの実行**、**日次上限の深夜0時解除** などを固定。
- **E2E（決定的）**: `.output/chrome-mv3` を実際に読み込み、`www.youtube.com` をローカル静的フィクスチャでスタブ。先頭 N 件表示・棚の非表示・ページ送り・カード個別ボタン・中央寄せ/幅・設定反映・しきい値でのタブクローズ・利用制限オーバーレイ・エンドスクリーン抑制を検証。`pnpm build` を先に実行。オフラインで安定。
- **E2E（ライブ, `@live`）**: 本物の youtube.com を実際に開き、実ページで `tf-watch` が付くか・**再生後のエンドスクリーンが実際に消えるか**などを検証（`tests/e2e/youtube-live.spec.ts`）。静的フィクスチャでは分からない「実 DOM での実効」を確かめるための層。YouTube 側の変化で不安定になりうるので既定スイートからは除外し、`pnpm test:e2e:live` で明示実行する。
- E2E は拡張を読み込むため full chromium が必要です（fixtures 側で `headless:false` + `--headless=new` を指定）。

## デバッグ
- コンテンツ側は `[TubeFlow]...` 系の `console.warn` を出力します（想定内のフォールバック時など）。
- `<html>` のクラス（上表の `tf-*`）とタイルの `data-tf-tile` / `data-tf-rec` を DevTools で見ると、現在の制御状態を確認できます。
- YouTube の DOM が変わって効かなくなった場合は、まず `lib/adapters.ts` のセレクタを実 DOM に合わせて更新してください。

## 変更履歴
[`CHANGELOG.md`](./CHANGELOG.md) を参照してください。
