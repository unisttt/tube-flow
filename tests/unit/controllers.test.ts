import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DEFAULTS, type Settings } from '../../lib/settings';
import { createHomeController } from '../../lib/content/home';
import { createWatchController } from '../../lib/content/watch';

declare global {
  interface Window {
    happyDOM: { setURL(url: string): void };
  }
}

function setUrl(url: string): void {
  window.happyDOM.setURL(url);
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULTS, ...overrides };
}

function resetHtml(): void {
  document.documentElement.className = '';
  document.body.innerHTML = '';
}

beforeEach(resetHtml);
afterEach(resetHtml);

describe('home controller', () => {
  function mountHome(tileCount: number): void {
    const tiles = Array.from({ length: tileCount })
      .map((_, i) => `<ytd-rich-item-renderer data-i="${i}"><a href="/watch?v=${i}"></a></ytd-rich-item-renderer>`)
      .join('');
    document.body.innerHTML = `
      <ytd-rich-grid-renderer><div id="contents">${tiles}</div></ytd-rich-grid-renderer>
    `;
  }

  it('shows only the first visibleCount tiles and hides the rest', () => {
    setUrl('https://www.youtube.com/');
    mountHome(5);
    let current: Settings = settings({ visibleCount: 1 });
    const home = createHomeController({
      getSettings: () => current,
      onState: () => {},
      requestExit: () => {},
    });

    home.apply('test');

    const tiles = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
    expect(tiles.every((t) => t.hasAttribute('data-tf-tile'))).toBe(true);
    expect(tiles[0]!.classList.contains('tf-visible')).toBe(true);
    expect(tiles.slice(1).every((t) => t.classList.contains('tf-hidden'))).toBe(true);
    expect(document.documentElement.classList.contains('tf-home')).toBe(true);
    expect(document.documentElement.classList.contains('tf-ready')).toBe(true);

    home.destroy();
  });

  it('shows the whole window and "next" advances by visibleCount (page送り)', () => {
    setUrl('https://www.youtube.com/');
    mountHome(9);
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 3 }),
      onState: () => {},
      requestExit: () => {},
    });
    home.apply('test');

    const tiles = () => Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
    const visibleIndices = () =>
      tiles()
        .map((t, i) => (t.classList.contains('tf-visible') ? i : -1))
        .filter((i) => i >= 0);

    // 最初のページ: 0,1,2
    expect(visibleIndices()).toEqual([0, 1, 2]);

    // 「次へ」で 3 枚まとめて送る → 次のページ 3,4,5
    home.next();
    home.apply('after-next');
    expect(visibleIndices()).toEqual([3, 4, 5]);
    home.destroy();
  });

  it('adds per-card action buttons to each visible card only', () => {
    setUrl('https://www.youtube.com/');
    mountHome(5);
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 3 }),
      onState: () => {},
      requestExit: () => {},
    });
    home.apply('test');

    const withActions = Array.from(document.querySelectorAll('ytd-rich-item-renderer'))
      .filter((t) => Array.from(t.children).some((c) => c.classList.contains('tf-card-actions')));
    // 表示中の 3 枚だけにボタンが付く
    expect(withActions.length).toBe(3);
    // 各カードに「後で見る」「興味なし」の 2 ボタン
    expect(withActions[0]!.querySelectorAll('[data-tf-action]').length).toBe(2);
    home.destroy();
  });

  it('requests exit when skip threshold is reached', () => {
    setUrl('https://www.youtube.com/');
    mountHome(10);
    let exitReason: string | null = null;
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 1, skipCloseThreshold: 2 }),
      onState: () => {},
      requestExit: (reason) => {
        exitReason = reason;
      },
    });
    home.apply('test');
    home.next();
    home.next();
    expect(exitReason).toBe('skip-threshold');
    home.destroy();
  });

  it('blocks further "next" once the skip limit is reached (残り0 では進まない)', () => {
    setUrl('https://www.youtube.com/');
    mountHome(10);
    let exitCount = 0;
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 1, skipCloseThreshold: 2 }),
      onState: () => {},
      requestExit: () => {
        exitCount += 1;
      },
    });
    const visibleIndex = () =>
      Array.from(document.querySelectorAll('ytd-rich-item-renderer')).findIndex((t) =>
        t.classList.contains('tf-visible'),
      );

    home.apply('test');
    home.next(); // skip 1
    home.next(); // skip 2 → 上限到達・退出要求
    home.apply('at-limit');
    const indexAtLimit = visibleIndex();
    expect(home.getSnapshot().remainingSkips).toBe(0);
    expect(home.getSnapshot().atSkipLimit).toBe(true);

    // 残り0 でさらに押しても進まない（カーソル据え置き・退出要求は増えない）
    home.next();
    home.apply('after-limit');
    expect(visibleIndex()).toBe(indexAtLimit);
    expect(exitCount).toBe(1);
    home.destroy();
  });

  it('masks non-tile shelves/sections via the managed root (その他のトピック 対策)', () => {
    setUrl('https://www.youtube.com/');
    // タイルの間に「その他のトピック」相当のセクション棚を差し込む
    document.body.innerHTML = `
      <ytd-rich-grid-renderer><div id="contents">
        <ytd-rich-item-renderer data-i="0"><a href="/watch?v=0"></a></ytd-rich-item-renderer>
        <ytd-rich-section-renderer class="topic-shelf"><span>その他のトピック</span></ytd-rich-section-renderer>
        <ytd-rich-item-renderer data-i="1"><a href="/watch?v=1"></a></ytd-rich-item-renderer>
        <ytd-continuation-item-renderer></ytd-continuation-item-renderer>
      </div></ytd-rich-grid-renderer>
    `;
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 1 }),
      onState: () => {},
      requestExit: () => {},
    });
    home.apply('test');

    const container = document.querySelector('#contents')!;
    expect(container.classList.contains('tf-managed-root')).toBe(true);
    // タイル以外の直下要素には data-tf-tile が付かない（CSS で display:none 対象になる）
    const section = document.querySelector('ytd-rich-section-renderer')!;
    const continuation = document.querySelector('ytd-continuation-item-renderer')!;
    expect(section.hasAttribute('data-tf-tile')).toBe(false);
    expect(continuation.hasAttribute('data-tf-tile')).toBe(false);
    // タイルには付く
    expect(document.querySelectorAll('ytd-rich-item-renderer[data-tf-tile]').length).toBe(2);
    home.destroy();
  });

  it('does nothing to the DOM when disabled', () => {
    setUrl('https://www.youtube.com/');
    mountHome(3);
    const home = createHomeController({
      getSettings: () => settings({ enabled: false }),
      onState: () => {},
      requestExit: () => {},
    });
    home.apply('test');
    const tiles = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
    expect(tiles.some((t) => t.hasAttribute('data-tf-tile'))).toBe(false);
    expect(document.documentElement.classList.contains('tf-home')).toBe(false);
    home.destroy();
  });
});

describe('watch controller (regression: nested recommendations)', () => {
  // 2026-07 の実 DOM: おすすめは #items 直下ではなく ytd-item-section-renderer にネスト
  function mountWatch(recCount: number): void {
    const recs = Array.from({ length: recCount })
      .map((_, i) => `<yt-lockup-view-model data-i="${i}"></yt-lockup-view-model>`)
      .join('');
    document.body.innerHTML = `
      <ytd-watch-flexy>
        <div id="secondary">
          <div id="related">
            <ytd-watch-next-secondary-results-renderer>
              <div id="items">
                <ytd-item-section-renderer>
                  <div id="contents">${recs}</div>
                </ytd-item-section-renderer>
              </div>
            </ytd-watch-next-secondary-results-renderer>
          </div>
        </div>
      </ytd-watch-flexy>
    `;
  }

  it('hides the whole recommendations panel when watchVisibleCount = 0', () => {
    setUrl('https://www.youtube.com/watch?v=abc');
    mountWatch(5);
    const watch = createWatchController({ getSettings: () => settings({ watchVisibleCount: 0 }) });
    watch.apply('test');

    expect(document.documentElement.classList.contains('tf-watch')).toBe(true);
    expect(document.documentElement.classList.contains('tf-watch-hide-all')).toBe(true);
    expect(document.documentElement.classList.contains('tf-watch-ready')).toBe(true);
    watch.destroy();
  });

  it('reveals exactly N nested recommendations when watchVisibleCount = 2', () => {
    setUrl('https://www.youtube.com/watch?v=abc');
    mountWatch(5);
    const watch = createWatchController({ getSettings: () => settings({ watchVisibleCount: 2 }) });
    watch.apply('test');

    const recs = Array.from(document.querySelectorAll('yt-lockup-view-model'));
    // 深くネストしていても属性が付与され、先頭 2 件のみ tf-visible
    expect(recs.every((r) => r.hasAttribute('data-tf-rec'))).toBe(true);
    const visible = recs.filter((r) => r.classList.contains('tf-visible'));
    const hidden = recs.filter((r) => r.classList.contains('tf-hidden'));
    expect(visible.length).toBe(2);
    expect(hidden.length).toBe(3);
    expect(document.documentElement.classList.contains('tf-watch-hide-all')).toBe(false);
    watch.destroy();
  });
});
