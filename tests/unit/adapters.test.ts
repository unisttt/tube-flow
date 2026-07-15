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
  // 2026 現行の実 DOM 構造（yt-thumbnail-badge-view-model > badge-shape > .ytBadgeShapeText）。
  // 旧セレクタしか無かったため実 YouTube で時間が取れず全カード除外になった回帰の防止。
  it('reads the 2026 badge-shape structure (.ytBadgeShapeText)', () => {
    const tile = tileHtml(`
      <ytd-rich-item-renderer>
        <a href="/watch?v=x"></a>
        <yt-thumbnail-badge-view-model class="ytThumbnailBadgeViewModelHost"><badge-shape class="ytBadgeShapeHost"><div class="ytBadgeShapeText">22:20</div></badge-shape></yt-thumbnail-badge-view-model>
      </ytd-rich-item-renderer>`);
    expect(readTileDuration(tile)).toBe(1340);
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
