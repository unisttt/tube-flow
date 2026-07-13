/**
 * カード単位のアクション（後で見る / 興味なし）。
 * 新レイアウトではサムネイルのオーバーレイボタンが消えたため、
 * 「直接ボタン → 3 点メニューを開いて該当項目をクリック」の順にフォールバックする。
 *
 * 返り値は「実際に項目をクリックできたか」を表す Promise<boolean>。
 * メニューを開いただけでは true を返さない（＝成功のフリをしない）。
 */
import * as sel from '../adapters';

const MENU_ITEM_SELECTOR = sel.menuItems.join(', ');

function matchLabel(node: Element, patterns: readonly RegExp[]): boolean {
  const aria = (node.getAttribute('aria-label') ?? '').toLowerCase();
  const text = (node.textContent ?? '').trim().toLowerCase();
  return patterns.some((p) => p.test(aria) || p.test(text));
}

/** 現在開いているメニューから、ラベルが一致する項目を探す */
function findMenuItem(patterns: readonly RegExp[]): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
  return nodes.find((n) => matchLabel(n, patterns)) ?? null;
}

function clickItem(node: HTMLElement): void {
  node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  node.click();
}

function findMenuButton(tile: Element): HTMLElement | null {
  for (const selector of sel.menuButtons) {
    const el = tile.querySelector<HTMLElement>(selector);
    if (el instanceof HTMLElement) {
      return el;
    }
  }
  return null;
}

/** 開いたままのメニューを閉じる（Escape 相当） */
function closeOpenMenu(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }),
  );
}

/** 条件が満たされるまでポーリングして待つ（満たされなければ null） */
function waitFor<T>(fn: () => T | null, timeoutMs = 2500, intervalMs = 60): Promise<T | null> {
  const immediate = fn();
  if (immediate) {
    return Promise.resolve(immediate);
  }
  return new Promise((resolve) => {
    let elapsed = 0;
    const timer = setInterval(() => {
      const result = fn();
      elapsed += intervalMs;
      if (result || elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(result ?? null);
      }
    }, intervalMs);
  });
}

async function activate(
  tile: Element,
  directButtons: readonly string[],
  patterns: readonly RegExp[],
): Promise<boolean> {
  // 1. 直接ボタン（旧レイアウト用。あれば即クリック）
  for (const selector of directButtons) {
    const button = tile.querySelector<HTMLElement>(selector);
    if (button) {
      button.click();
      return true;
    }
  }

  // 2. すでにメニューが開いていて該当項目があるなら、それをクリック
  const existing = findMenuItem(patterns);
  if (existing) {
    clickItem(existing);
    return true;
  }

  // 3. 3 点メニューを開き、該当項目が現れるのを待ってクリック
  const menuButton = findMenuButton(tile);
  if (!menuButton) {
    return false;
  }
  menuButton.click();
  const item = await waitFor(() => findMenuItem(patterns));
  if (!item) {
    // 見つからなければ、開いたメニューは閉じておく（開きっぱなしにしない）
    closeOpenMenu();
    return false;
  }
  clickItem(item);
  return true;
}

export function addToWatchLater(tile: Element | null): Promise<boolean> {
  if (!tile) {
    return Promise.resolve(false);
  }
  return activate(tile, sel.watchLaterButtons, sel.WATCH_LATER_PATTERNS);
}

export function markNotInterested(tile: Element | null): Promise<boolean> {
  if (!tile) {
    return Promise.resolve(false);
  }
  return activate(tile, sel.notInterestedButtons, sel.NOT_INTERESTED_PATTERNS);
}
