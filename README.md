# Tube Flow (Chrome Extension)

Tube Flow は YouTube ホーム画面に表示されるカードを最小化し、衝動的な視聴を抑えることを目的とした Manifest v3 対応の Chrome 拡張です。先頭 1 件だけを表示し、キーボードまたは右下ミニ UI で「次へ進む／後で見る」操作に集中できます。

## 主な機能
- **フォーカス表示**: ホーム `/` のカードは先頭 `visibleCount` 件（既定 1）のみ `hd-visible` として表示し、それ以外は完全にマスクします。
- **Shorts 抑制**: reel/shelf ベースの Shorts セクションを既定で非表示化。
- **キーボード操作**: Alt+J で次のカードへ、Alt+L で「後で見る」に追加。連続スキップ残数をミニ UI に表示します。
- **連続スキップ閾値**: `skipCloseThreshold` に達するとサービスワーカー経由でタブを閉じるなどのアクションをトリガー（挙動は今後拡張予定）。
- **ログ／ステートイベント**: `tube-flow:state` カスタムイベントで UI / 他モジュールへ状態を配信。

## 仕組み概要
- `content/prelude.js` が `document_start` で走り、`html.hd-home-target` クラスとマスク用 CSS を適用。視覚的にカードが目に入る前に覆い隠します。
- `content/main.js` が DOM 適用、MutationObserver、SPA イベント (`yt-navigate-*`) に対応し、カードごとに `hd-visible` / `hd-hidden` を切り替えます。
- 右下ミニ UI (`content/ui/controls.js`) はマウント後に Tube Flow コアへイベントを投げ、残りスキップ回数などのステートを反映します。
- 背景サービスワーカー (`background/service.js`) はショートカットコマンドを content script へ仲介し、閾値到達時の `request-exit` を受け取ります。

ディレクトリ構成の一例:
```
content/
  ├─ prelude.js          // document_startの初期マスク
  ├─ main.js             // コア制御（可視化・MutationObserver）
  ├─ ui/controls.js      // 右下ミニ UI
  ├─ adapters/home.js    // ホーム専用 DOM セレクタ
  └─ style.css           // .hd-* 名前空間のスタイル
background/service.js    // MV3 service worker
manifest.json            // 拡張設定
```

## インストール（デベロッパー向け）
1. `pnpm install` で依存を取得。
2. Chrome で `chrome://extensions/` を開き、デベロッパーモードを ON。
3. 「パッケージ化されていない拡張機能を読み込む」でこの `tube-flow` ディレクトリを指定。
4. YouTube ホームをリロードすると、カードが 1 件だけ表示されるようになります。

## 操作方法
| 操作 | キーボード | 説明 |
|------|------------|------|
| 次のカードへ | Alt+J (macOS では Option+J) | 表示カーソルを +1。右下 UI に残りスキップ回数を表示 |
| 後で見るへ追加 | Alt+L | 現在のカードにある「後で見る / Watch later」をクリック代行 |

右下ミニ UI でも同じ 2 操作が利用できます。連続スキップ残数は `skipCloseThreshold` を超えると 0 になり、バックグラウンドへ `request-exit` が送信されます。

## 設定 (`chrome.storage.sync`)
```json
{
  "visibleCount": 1,
  "hideShorts": true,
  "skipCloseThreshold": 3
}
```
- `visibleCount`: 常時表示するカード枚数（0 で全非表示）。
- `hideShorts`: Shorts 系棚のマスクを有効にするか。
- `skipCloseThreshold`: Alt+J を続けて押した際の閾値（0 で無効）。閾値超過時の最終動作は service worker でハンドリングします。

## 開発・テスト
- 依存インストール: `pnpm install`
- ユニットテスト（Vitest + jsdom）: `pnpm test:unit`
- 統合テスト（Playwright / Chromium 拡張）: `pnpm exec playwright install chromium` → `pnpm test:int`
  - Playwright テストは `tests/integration/tube-flow.spec.js` が YouTube をフィクスチャ HTML でスタブし、`hd-hidden` 制御と UI 操作を検証します。

## ログ/デバッグ
- `console.debug` で `[TubeFlow][prelude]`, `[TubeFlow] setReadyState`, `[TubeFlow] applied` などが出力されます。DevTools Console のレベルを “Verbose” にすると一覧できます。
- `window.addEventListener('tube-flow:state', (event) => console.log(event.detail))` のようにしてコア状態を把握することも可能です。

## 今後の拡張案
- ホーム以外（検索結果 `/results` など）への対応。
- `skipCloseThreshold` 到達時の動作をオプション UI で選択可能にする（タブ閉鎖など）。
- セレクタの多言語・DOM 変更検知の仕組み強化。
- CI での Playwright 実行、HAR リプレイによるモック整備。

集中して視聴する／しないを切り替えたい場合、Tube Flow をオンにしたままでも必要な動画だけにフォーカスして判断できるはずです。疑問点や改善案があれば Issue/PR でフィードバックしてください。
