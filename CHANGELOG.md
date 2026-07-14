Tube Flow の主要な変更を記録します。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、日付は YYYY-MM-DD 形式です。

## [Unreleased]

### 変更（Changed）
- **スキップ回数の閾値＋タブクローズを廃止**（`skipCloseThreshold`・`request-exit`・背景のタブクローズを削除）。更新/開き直しで無意味なため。代わりに**「次へ」は回数無制限**にし、**押した回数＝依存度として日別に累積記録・可視化**する方式へ変更。
- **「次へ」回数を日次リセットから日別累積の履歴へ**（`tubeflow-usage.skips: number` → `skipHistory: { 'YYYY-MM-DD': number }`）。回数＝依存度なのでリセットせず貫通させ、推移を可視化する。右下ミニ UI は**累計バッジ**（`累計N回`、その日の押しすぎを色で警告）、ポップアップは**直近7日の棒グラフ**＋累計/本日、オプションは**直近14日の棒グラフ**を表示。旧スキーマの単日 `skips` は読み込み時に該当日の履歴へ自動移行。`seconds`（視聴秒数）は日次上限判定に使うため従来どおり日次リセット。

### 追加（Added）
- **表示カードの中央寄せ**: ホームの表示カードを左上詰めから中央寄せに（管理ルートを `justify-content: center`）。表示枚数に依存せず中央に寄る。
- **カードの大きさ設定 `cardWidth`**: 表示カード1枚の幅（px、既定720、360–1280）を設定可能に。幅に応じてサムネイル/文字も16:9のまま比例拡大。画面幅で頭打ち。オプションに数値入力、ポップアップにステッパーを追加。
- **再生時間フィルタ**: ホームのカードを再生時間（最短〜最長・分）で絞り込み。時間不明カード（LIVE 等）は除外。設定 `durationFilterEnabled`/`durationMinMinutes`/`durationMaxMinutes`。
- **スキップした動画を隠す**: 「次へ」でスキップした動画をリセットまで再表示しない（`tubeflow-dismissed`, 日次自動＋ポップアップ手動リセット）。設定 `hideSkippedEnabled`。

### 修正（Fixed）
- 利用制限の遮断オーバーレイが半透明（`rgba(8,8,10,0.97)`）で、裏の YouTube がうっすら透けていた不具合。完全不透明（`#08080a`）にして一切透けないようにした（不要になった `backdrop-filter` のぼかしも削除）。
- 再生後のおすすめ（エンドスクリーン）の抑制強化: ビデオウォールに加え、**自動再生の「次の動画」カード**（`.ytp-autonav-endscreen-countdown-overlay`）もカウントダウンオーバーレイごと非表示に。旧実装はボタンしか隠せていなかった。
- ホーム以外（/watch・検索など）で Alt+J「次へ」を押すとスキップ回数が増え、閾値到達でタブが閉じられていた不具合。ホーム限定に修正。
- `watchVisibleCount>0` のとき視聴ページの Shorts/リール棚が隠れていなかった不具合。
- 日次上限の遮断が深夜0時を過ぎても解けなかった不具合（読み取り時にも日次リセット）。

## [0.5.0] - 2026-07-13

### 追加（Added）
- **利用制限（使いすぎ防止）機能**:
  - **時間帯ブロック**: 指定した時間帯（毎日適用・日またぎ可、最大12件）は YouTube を全画面オーバーレイで遮断。
  - **1 日の視聴時間上限**: 動画の再生中の時間が上限（分）を超えたら遮断。毎日 0 時にリセット。視聴秒数は `chrome.storage.local` に保存。
  - ブロック時は再生中の動画も停止。一時解除（スヌーズ）は無し。
  - オプション画面に時間帯エディタ・上限分・本日の視聴時間を、ポップアップに 2 制限の ON/OFF と本日の視聴時間を追加。
  - 判定ロジック `lib/restrictions.ts`、視聴計測 `lib/usage.ts`、実行 `lib/content/blocker.ts`。ユニット/E2E で判定・遮断表示を固定。

## [0.4.0] - 2026-07-13

技術スタックを [WXT](https://wxt.dev) + TypeScript へ全面刷新したメジャー改修。機能要件は従来どおり。

### 変更（Changed）
- **基盤刷新**: 素の JS + 手書きセレクタ構成から WXT + TypeScript へ移行。ビルド成果物は `.output/chrome-mv3`（読み込み先が変わりました）。
- **表示制御を属性ベースへ**: `#items > *` のような直下依存をやめ、`data-tf-tile` / `data-tf-rec` + `.tf-visible` / `.tf-hidden` によるネスト深度非依存の方式へ。DOM セレクタは `lib/adapters.ts` に一元化。
- **「次へ」を 1 ページ送りに**: 表示枚数（`visibleCount`）ぶんをまとめて送るように（従来は 1 枚ずつで、複数表示時に 1 枚しか流れなかった）。スキップ回数は「1 押下 = 1」でカウント。
- **後で見る / 興味なしをカード単位に**: 表示中の各カードへ個別ボタンをオーバーレイ表示し、複数表示時も対象を直接選べるように。右下ミニ UI は「次へ」のみへ整理（キーボード Alt+L / Alt+Shift+I は先頭カードに作用）。

### 修正（Fixed）
- **視聴ページのおすすめ制御**: おすすめが `#items` 直下ではなく `ytd-item-section-renderer` にネストされる現行 DOM に対応できず壊れていた不具合を解消。
- **ホームの棚が残る不具合**: 「その他のトピック」等の `ytd-rich-section-renderer` や continuation がマスクされず表示されていた問題を修正（`tf-managed-root` 直下のタイル以外を一括マスク）。
- **スキップ上限で止まらない不具合**: 「次へ」が残り 0（`skipCloseThreshold` 到達）でも押せて進んでしまう問題を修正。上限到達後は「次へ」を停止・ボタン無効化し、タブクローズ要求のみ担保。
- **後で見る/興味なしが実行されない不具合**: 3 点メニューは開くのに項目がクリックされない問題を修正。メニュー項目セレクタを現行 DOM（`button.ytListItemViewModelButtonOrAnchor`）へ更新し、「メニューを開いた時点で成功扱い」だった実装を、実際に項目をクリックできたかを返す `Promise<boolean>` へ改修。失敗時はメニューを閉じる。

### テスト（Tests）
- Vitest(happy-dom) + Playwright(ビルド済み拡張ロード) へ再構成。
- 回帰を固定: 視聴ページのネスト構造 / ホームの棚マスク / スキップ上限での停止 / しきい値到達でのタブクローズ。

## [0.3.0] - 2025-10-12
- Added a global enable/disable toggle that instantly restores the original YouTube UI when Tube Flow is turned off.
- Introduced a toolbar popup for quick access to all settings, including Shorts suppression and card visibility counts.
- Ensured the floating control panel hides when Tube Flow is disabled and reliably reappears after re-enabling.
- Tightened the pre-hide sequence to prevent a brief flash of all home cards when navigating back from a watch page.

## [0.2.4]
- Improved tile detection for the polymer-less (`yt-lockup-view-model`) layout and shelf sections to reduce flicker during filtering.

--

Older history is tracked in git commits.
