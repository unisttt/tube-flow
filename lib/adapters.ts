/**
 * YouTube の DOM セレクタを一元管理する層。
 * DOM 変更時はこのファイルだけを直せば済むように、他モジュールは生セレクタを持たない。
 *
 * 2026-07 時点の実 DOM に合わせて更新:
 *  - カードは全面 `yt-lockup-view-model`（Polymerless）へ移行。
 *  - 視聴ページのおすすめは `#items` 直下ではなく `ytd-item-section-renderer` にネスト。
 *    → 直下前提のセレクタをやめ、コンテナ配下を deep に走査する。
 */

import { parseDurationText } from './duration';
import { parseVideoId } from './video-id';

/** 複数候補セレクタから最初にマッチした要素を返す */
export function queryFirst<T extends Element = Element>(
  candidates: readonly string[],
  root: ParentNode = document,
): T | null {
  for (const selector of candidates) {
    const el = root.querySelector<T>(selector);
    if (el) {
      return el;
    }
  }
  return null;
}

export const home = {
  /** リッチグリッドの #contents（タイルの親コンテナ） */
  rootCandidates: [
    'ytd-rich-grid-renderer > #contents',
    'ytd-rich-grid-renderer #contents',
    'ytd-two-column-browse-results-renderer #primary ytd-rich-grid-renderer > #contents',
    'ytd-two-column-browse-results-renderer #primary ytd-rich-grid-renderer',
  ],
  /** 動画カード本体 */
  tile: 'ytd-rich-item-renderer, yt-lockup-view-model, yt-lockup-renderer',
  /** タイル走査時に「棚の中身」を巻き込まないよう除外する祖先 */
  excludeAncestors: [
    'ytd-rich-shelf-renderer',
    'ytd-reel-shelf-renderer',
    'ytd-rich-section-renderer',
  ],
  /** Shorts 棚 */
  shortsShelves: [
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-rich-shelf-renderer[modernized-shelf-title*="Shorts" i]',
  ],
  /** サムネイルの再生時間バッジ（新旧レイアウト併記。実 DOM で要確認） */
  durationBadge: [
    // 2026 現行 DOM: yt-thumbnail-badge-view-model > badge-shape > div.ytBadgeShapeText
    // （時間・4K・ライブ等が同クラス。readTileDuration が時間形式のものだけ採用する）
    'yt-thumbnail-badge-view-model .ytBadgeShapeText',
    'badge-shape .ytBadgeShapeText',
    '.ytBadgeShapeText',
    // 旧レイアウトのフォールバック
    'ytd-thumbnail-overlay-time-status-renderer #text',
    'ytd-thumbnail-overlay-time-status-renderer',
    'thumbnail-overlay-badge-view-model .badge-shape-wiz__text',
    'badge-shape .badge-shape-wiz__text',
    '.ytThumbnailOverlayBadgeViewModelHost .badge-shape-wiz__text',
  ],
  /** カードの動画リンク（先頭一致を採用） */
  videoLink: ['a#thumbnail[href]', 'a[href*="watch?v="]', 'a[href^="/watch"]', 'a[href^="/shorts/"]'],
} as const;

export const watch = {
  /** おすすめリストのコンテナ（この配下を deep 走査する） */
  containerCandidates: [
    'ytd-watch-flexy #related ytd-watch-next-secondary-results-renderer',
    'ytd-watch-flexy #secondary ytd-watch-next-secondary-results-renderer',
    'ytd-watch-next-secondary-results-renderer',
  ],
  /** おすすめ 1 件に相当する要素（件数カウント対象） */
  recommendation: [
    'yt-lockup-view-model',
    'ytd-compact-video-renderer',
    'ytd-compact-radio-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-compact-movie-renderer',
    'ytd-compact-station-renderer',
    'ytd-compact-show-renderer',
    'ytd-compact-mix-renderer',
  ],
  /** 常に隠す横スクロール棚（Shorts など） */
  alwaysHide: ['ytd-reel-shelf-renderer', 'yt-horizontal-list-renderer'],
} as const;

/** 「後で見る」ボタンの直接セレクタ候補（新旧レイアウト両対応） */
export const watchLaterButtons: readonly string[] = [
  'ytd-thumbnail-overlay-toggle-button-renderer[aria-label*="後で見る" i] button',
  'ytd-thumbnail-overlay-toggle-button-renderer[aria-label*="Watch later" i] button',
  'yt-button-shape[aria-label*="後で見る" i] button',
  'yt-button-shape[aria-label*="Watch later" i] button',
  'button[aria-label*="後で見る" i]',
  'button[aria-label*="Watch later" i]',
];

/** 「興味なし」ボタンの直接セレクタ候補 */
export const notInterestedButtons: readonly string[] = [
  'yt-button-shape[aria-label*="興味なし" i] button',
  'yt-button-shape[aria-label*="Not interested" i] button',
  'button[aria-label*="興味なし" i]',
  'button[aria-label*="Not interested" i]',
];

/** カード内の 3 点メニュー（その他の操作）ボタン候補 */
export const menuButtons: readonly string[] = [
  'button[aria-label*="その他の操作" i]',
  'button[aria-label*="操作メニュー" i]',
  'button[aria-label*="More actions" i]',
  'button[aria-label*="Action menu" i]',
  'ytd-menu-renderer button',
  'yt-icon-button button',
  '#menu button',
];

/** 開いたメニューのコンテナ候補（この配下に項目がある） */
export const menuContainers: readonly string[] = [
  'tp-yt-iron-dropdown',
  'ytd-menu-popup-renderer',
  'yt-sheet-view-model',
];

/**
 * 開いたメニュー内の「クリック対象」項目候補。
 * 2026-07 の現行メニューは `button.ytListItemViewModelButtonOrAnchor`
 * （中に `span.ytListItemViewModelTitle`）。旧レイアウトも候補に残す。
 */
export const menuItems: readonly string[] = [
  'button.ytListItemViewModelButtonOrAnchor',
  '.yt-list-item-view-model__container',
  'ytd-menu-service-item-renderer',
  'tp-yt-paper-item[role="menuitem"]',
];

// ラベルは部分一致。「[後で見る] に保存」「興味なし」などにマッチさせる。
export const WATCH_LATER_PATTERNS = [/watch later/i, /後で見る/, /save to watch later/i];
// 「チャンネルをおすすめに表示しない」を誤爆しないよう「興味なし/興味がない」に限定
export const NOT_INTERESTED_PATTERNS = [/not interested/i, /興味がない/, /興味なし/];

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
