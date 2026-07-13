/**
 * ホーム（/）のカード表示制御。
 * リッチグリッドを監視し、カーソル起点で先頭 N 件だけ表示する。
 */
import type { Settings } from '../settings';
import { clampCursor, computeVisibleBounds, shouldRequestExit } from '../cursor';
import { isHomePage } from '../page';
import * as sel from '../adapters';
import { queryFirst } from '../adapters';
import { addToWatchLater, markNotInterested } from './actions';

const TILE_ATTR = 'data-tf-tile';
const ROOT_MANAGED_CLASS = 'tf-managed-root';
const CARD_CLASS = 'tf-card';
const ACTIONS_CLASS = 'tf-card-actions';

export interface HomeSnapshot {
  isHome: boolean;
  enabled: boolean;
  threshold: number;
  remainingSkips: number | null;
  exitRequested: boolean;
  /** スキップ上限に達し、これ以上「次へ」できない状態か */
  atSkipLimit: boolean;
}

export interface HomeController {
  apply(reason: string): void;
  /** 「次へ」= 表示枚数ぶんまとめて送る（1 ページ送り） */
  next(): void;
  resetCursor(): void;
  addCurrentToWatchLater(): Promise<boolean>;
  markCurrentAsNotInterested(): Promise<boolean>;
  getSnapshot(): HomeSnapshot;
  destroy(): void;
}

interface HomeDeps {
  getSettings: () => Settings;
  onState: () => void;
  requestExit: (reason: string) => void;
}

export function createHomeController(deps: HomeDeps): HomeController {
  let cursorIndex = 0;
  let skipCount = 0;
  let exitRequested = false;
  let tiles: Element[] = [];
  let root: Element | null = null;
  let observer: MutationObserver | null = null;
  let applyTimer: ReturnType<typeof setTimeout> | null = null;
  let rootRetryTimer: ReturnType<typeof setTimeout> | null = null;

  const html = () => document.documentElement;
  const enabled = () => deps.getSettings().enabled;

  function setFlag(name: string, on: boolean): void {
    html().classList.toggle(name, on);
  }

  /** スキップ上限に達しているか（threshold 0 は監視無効なので常に false） */
  function atSkipLimit(): boolean {
    const threshold = Math.max(0, Number(deps.getSettings().skipCloseThreshold) || 0);
    return threshold > 0 && skipCount >= threshold;
  }

  function snapshot(): HomeSnapshot {
    const settings = deps.getSettings();
    const threshold = Math.max(0, Number(settings.skipCloseThreshold) || 0);
    const remainingSkips = threshold ? Math.max(0, threshold - skipCount) : null;
    return {
      isHome: isHomePage(),
      enabled: settings.enabled,
      threshold,
      remainingSkips,
      exitRequested,
      atSkipLimit: atSkipLimit(),
    };
  }

  function emit(): void {
    deps.onState();
  }

  function scheduleApply(reason: string): void {
    if (applyTimer) {
      return;
    }
    applyTimer = setTimeout(() => {
      applyTimer = null;
      apply(reason);
    }, 160);
  }

  function requestRootRetry(): void {
    if (rootRetryTimer) {
      return;
    }
    rootRetryTimer = setTimeout(() => {
      rootRetryTimer = null;
      scheduleApply('root-retry');
    }, 400);
  }

  function clearRootRetry(): void {
    if (rootRetryTimer) {
      clearTimeout(rootRetryTimer);
      rootRetryTimer = null;
    }
  }

  function disconnectObserver(): void {
    observer?.disconnect();
  }

  /** 変化したノードがすべて Tube Flow 由来（カードオーバーレイ）なら自己変更とみなす */
  function isSelfMutation(m: MutationRecord): boolean {
    const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
    return (
      nodes.length > 0 &&
      nodes.every(
        (n) => n instanceof Element && n.classList.contains(ACTIONS_CLASS),
      )
    );
  }

  function reconnectObserver(): void {
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type !== 'childList' || (!m.addedNodes.length && !m.removedNodes.length)) {
            continue;
          }
          // 自前のカードオーバーレイ挿入/削除は無視（apply の再入ループを避ける）
          if (isSelfMutation(m)) {
            continue;
          }
          scheduleApply('mutation');
          break;
        }
      });
    }
    if (!root) {
      disconnectObserver();
      return;
    }
    observer.disconnect();
    try {
      observer.observe(root, { childList: true, subtree: true });
    } catch (error) {
      console.warn('[TubeFlow][home] observer attach failed', error);
    }
  }

  function clearTileDecorations(list: Iterable<Element>): void {
    for (const tile of list) {
      tile.classList.remove('tf-hidden', 'tf-visible', CARD_CLASS);
      tile.removeAttribute(TILE_ATTR);
      removeCardActions(tile);
    }
  }

  function directCardActions(tile: Element): Element | null {
    for (const child of Array.from(tile.children)) {
      if (child.classList.contains(ACTIONS_CLASS)) {
        return child;
      }
    }
    return null;
  }

  /** 表示中カードに「後で見る/興味なし」の個別ボタンを重ねる（無ければ生成） */
  function ensureCardActions(tile: Element): void {
    if (directCardActions(tile)) {
      return;
    }
    const actions = document.createElement('div');
    actions.className = ACTIONS_CLASS;
    // このオーバーレイは Tube Flow 由来なので MutationObserver 側で無視する目印を付ける
    actions.setAttribute('data-tf-actions', '1');
    actions.innerHTML = `
      <button type="button" data-tf-action="watch-later" title="後で見る (Alt+L)">後で見る</button>
      <button type="button" data-tf-action="not-interested" title="興味なし (Alt+Shift+I)">興味なし</button>
    `;
    tile.appendChild(actions);
  }

  function removeCardActions(tile: Element): void {
    directCardActions(tile)?.remove();
  }

  function setRoot(next: Element | null): void {
    if (root && root !== next) {
      root.classList.remove(ROOT_MANAGED_CLASS);
      clearTileDecorations(root.querySelectorAll(`[${TILE_ATTR}]`));
    }
    root = next;
  }

  function ensureRoot(): Element | null {
    if (!isHomePage()) {
      disconnectObserver();
      setRoot(null);
      return null;
    }
    const previous = root;
    const next = queryFirst(sel.home.rootCandidates);
    if (!next) {
      setRoot(null);
      return null;
    }
    setRoot(next);
    if (root !== previous || !observer) {
      reconnectObserver();
    }
    clearRootRetry();
    return root;
  }

  /** 棚の中身や重複を除いた「純粋なホームカード」だけに絞る */
  function normalizeTiles(raw: Element[], container: Element): Element[] {
    if (!raw.length) {
      return raw;
    }
    const tokens = sel.home.tile.split(',').map((t) => t.trim()).filter(Boolean);
    const isTileNode = (el: Element): boolean =>
      tokens.some((t) => el.matches(t));
    // 別タイルの子孫になっているもの（入れ子）を除外
    const deduped = raw.filter((tile) => {
      let parent = tile.parentElement;
      while (parent && parent !== container) {
        if (isTileNode(parent)) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });
    return deduped.filter(
      (tile) => !sel.home.excludeAncestors.some((s) => tile.closest(s)),
    );
  }

  function toggleShorts(hide: boolean): void {
    for (const selector of sel.home.shortsShelves) {
      document.querySelectorAll(selector).forEach((el) => {
        el.classList.toggle('tf-hidden', hide);
      });
    }
  }

  function effectiveVisibleCount(): number {
    return Math.max(0, Number(deps.getSettings().visibleCount) || 0);
  }

  function teardown(): void {
    clearTileDecorations(tiles);
    tiles = [];
    root?.classList.remove(ROOT_MANAGED_CLASS);
    setFlag('tf-ready', false);
    toggleShorts(false);
  }

  function apply(reason: string): void {
    const settings = deps.getSettings();

    if (!isHomePage()) {
      setFlag('tf-home', false);
      teardown();
      setRoot(null);
      return;
    }
    if (!settings.enabled) {
      setFlag('tf-home', false);
      setFlag('tf-hide-shorts', false);
      teardown();
      disconnectObserver();
      setRoot(null);
      emit();
      return;
    }

    setFlag('tf-home', true);
    setFlag('tf-hide-shorts', Boolean(settings.hideShorts));

    const container = ensureRoot();
    if (!container) {
      setFlag('tf-ready', false);
      requestRootRetry();
      return;
    }

    const rawTiles = Array.from(container.querySelectorAll(sel.home.tile));
    const next = normalizeTiles(rawTiles, container);

    if (next.length === 0) {
      teardown();
      requestRootRetry();
      return;
    }

    // 前回対象から外れたタイルの装飾を除去
    for (const tile of tiles) {
      if (!next.includes(tile)) {
        tile.classList.remove('tf-hidden', 'tf-visible');
        tile.removeAttribute(TILE_ATTR);
      }
    }
    tiles = next;

    const visibleCount = effectiveVisibleCount();
    cursorIndex = clampCursor(cursorIndex, tiles.length, visibleCount);
    const bounds = computeVisibleBounds(cursorIndex, visibleCount);

    // 管理下グリッドでは、タイル以外の直下要素（棚・セクション・continuation）も一括マスクする
    container.classList.add(ROOT_MANAGED_CLASS);

    tiles.forEach((tile, index) => {
      tile.setAttribute(TILE_ATTR, '1');
      const shouldShow = visibleCount > 0 && index >= bounds.start && index < bounds.end;
      tile.classList.toggle('tf-visible', shouldShow);
      tile.classList.toggle('tf-hidden', !shouldShow);
      tile.classList.toggle(CARD_CLASS, shouldShow);
      // 表示中カードにだけ個別ボタンを付ける
      if (shouldShow) {
        ensureCardActions(tile);
      } else {
        removeCardActions(tile);
      }
    });

    toggleShorts(Boolean(settings.hideShorts));
    setFlag('tf-ready', true);
    void reason;
    emit();
  }

  function getCurrentTile(): Element | null {
    if (!enabled() || !tiles.length) {
      return null;
    }
    const index = clampCursor(cursorIndex, tiles.length, effectiveVisibleCount());
    return tiles[index] ?? null;
  }

  function maybeRequestExit(): void {
    if (!enabled()) {
      return;
    }
    if (!shouldRequestExit(skipCount, deps.getSettings().skipCloseThreshold)) {
      return;
    }
    if (exitRequested) {
      return;
    }
    exitRequested = true;
    deps.requestExit('skip-threshold');
  }

  /** 「次へ」= 表示枚数ぶん送る。押下ごとにスキップ回数は 1 増える。 */
  function next(): void {
    if (!enabled()) {
      return;
    }
    // スキップ上限に達していたら、それ以上は進めない（退出要求だけ担保する）
    if (atSkipLimit()) {
      maybeRequestExit();
      emit();
      return;
    }
    const step = Math.max(1, effectiveVisibleCount());
    cursorIndex += step;
    skipCount += 1;
    scheduleApply('cursor-change');
    maybeRequestExit();
    emit();
  }

  function resetCursor(): void {
    cursorIndex = 0;
    skipCount = 0;
    exitRequested = false;
    scheduleApply('cursor-reset');
    emit();
  }

  /** 各カードの個別ボタン（後で見る/興味なし）を document 委譲で処理する */
  function onCardActionClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLElement>('[data-tf-action]');
    if (!button) {
      return;
    }
    const tile = button.closest<Element>(`[${TILE_ATTR}]`);
    if (!tile || !enabled()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.tfAction;
    const result =
      action === 'watch-later'
        ? addToWatchLater(tile)
        : action === 'not-interested'
          ? markNotInterested(tile)
          : Promise.resolve(false);
    void result.then((ok) => {
      if (!ok) {
        button.setAttribute('data-error', 'true');
        setTimeout(() => button.removeAttribute('data-error'), 1500);
      }
    });
  }
  // capture フェーズで拾い、カード本体のリンク遷移より先に処理する
  document.addEventListener('click', onCardActionClick, true);

  return {
    apply,
    next,
    resetCursor,
    addCurrentToWatchLater: () =>
      enabled() ? addToWatchLater(getCurrentTile()) : Promise.resolve(false),
    markCurrentAsNotInterested: () =>
      enabled() ? markNotInterested(getCurrentTile()) : Promise.resolve(false),
    getSnapshot: snapshot,
    destroy(): void {
      document.removeEventListener('click', onCardActionClick, true);
      disconnectObserver();
      clearRootRetry();
      if (applyTimer) {
        clearTimeout(applyTimer);
      }
      teardown();
    },
  };
}
