import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addToWatchLater, markNotInterested } from '../../lib/content/actions';

/**
 * 実 YouTube のメニュー構造（2026-07）を模したフィクスチャ:
 *   3 点メニューボタン → クリックで tp-yt-iron-dropdown を開く
 *   各項目は button.ytListItemViewModelButtonOrAnchor > span.ytListItemViewModelTitle
 * 項目クリックで clicks に記録する。
 */
function buildTileWithMenu(labels: string[]): {
  tile: Element;
  clicks: Record<string, number>;
} {
  const clicks: Record<string, number> = {};
  const tile = document.createElement('ytd-rich-item-renderer');
  const menuBtn = document.createElement('button');
  menuBtn.setAttribute('aria-label', 'その他の操作');
  menuBtn.addEventListener('click', () => {
    const dropdown = document.createElement('tp-yt-iron-dropdown');
    for (const label of labels) {
      const button = document.createElement('button');
      button.className = 'ytListItemViewModelButtonOrAnchor';
      const span = document.createElement('span');
      span.className = 'ytListItemViewModelTitle';
      span.textContent = label;
      button.appendChild(span);
      button.addEventListener('click', () => {
        clicks[label] = (clicks[label] ?? 0) + 1;
        dropdown.remove();
      });
      dropdown.appendChild(button);
    }
    document.body.appendChild(dropdown);
  });
  tile.appendChild(menuBtn);
  document.body.appendChild(tile);
  return { tile, clicks };
}

const REAL_MENU = [
  'キューに追加',
  '[後で見る] に保存',
  '再生リストに保存',
  '共有',
  '興味なし',
  'チャンネルをおすすめに表示しない',
  '報告',
];

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('markNotInterested (正常系)', () => {
  it('opens the menu and actually clicks the 興味なし item', async () => {
    const { tile, clicks } = buildTileWithMenu(REAL_MENU);
    const ok = await markNotInterested(tile);
    expect(ok).toBe(true);
    expect(clicks['興味なし']).toBe(1);
    // 「チャンネルをおすすめに表示しない」を誤爆しない
    expect(clicks['チャンネルをおすすめに表示しない']).toBeUndefined();
    // クリックできたらメニューは閉じている
    expect(document.querySelector('tp-yt-iron-dropdown')).toBeNull();
  });
});

describe('addToWatchLater (正常系)', () => {
  it('clicks the "[後で見る] に保存" item', async () => {
    const { tile, clicks } = buildTileWithMenu(REAL_MENU);
    const ok = await addToWatchLater(tile);
    expect(ok).toBe(true);
    expect(clicks['[後で見る] に保存']).toBe(1);
  });
});

describe('actions (異常系)', () => {
  it('returns false when the tile has no menu button', async () => {
    const tile = document.createElement('ytd-rich-item-renderer');
    document.body.appendChild(tile);
    expect(await markNotInterested(tile)).toBe(false);
  });

  it('returns false (not fake success) when the item is absent, without misclicking', async () => {
    vi.useFakeTimers();
    const { tile, clicks } = buildTileWithMenu(['共有', '報告']); // 興味なし が無い
    const promise = markNotInterested(tile);
    await vi.advanceTimersByTimeAsync(3000);
    const ok = await promise;
    vi.useRealTimers();
    expect(ok).toBe(false);
    expect(Object.keys(clicks)).toHaveLength(0);
  });

  it('returns false for a null tile', async () => {
    expect(await markNotInterested(null)).toBe(false);
    expect(await addToWatchLater(null)).toBe(false);
  });
});
