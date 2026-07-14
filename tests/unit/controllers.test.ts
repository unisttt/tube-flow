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
      onSkip: () => {},
      isDismissed: () => false,
      dismiss: () => {},
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
      onSkip: () => {},
      isDismissed: () => false,
      dismiss: () => {},
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
      onSkip: () => {},
      isDismissed: () => false,
      dismiss: () => {},
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

  it('counts every "next" via onSkip without any limit (無制限に押せて回数を記録)', () => {
    setUrl('https://www.youtube.com/');
    mountHome(10);
    let skips = 0;
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 1 }),
      onState: () => {},
      onSkip: () => {
        skips += 1;
      },
      isDismissed: () => false,
      dismiss: () => {},
    });
    home.apply('test');
    // 何度でも押せる（上限なし・タブは閉じない）
    for (let i = 0; i < 15; i++) {
      home.next();
    }
    expect(skips).toBe(15);
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
      onSkip: () => {},
      isDismissed: () => false,
      dismiss: () => {},
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

  it('ignores "next" on non-home pages (Alt+J on /watch must not count skips)', () => {
    setUrl('https://www.youtube.com/watch?v=abc');
    document.body.innerHTML = '<div id="player"></div>';
    let skips = 0;
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 1 }),
      onState: () => {},
      onSkip: () => {
        skips += 1;
      },
      isDismissed: () => false,
      dismiss: () => {},
    });
    home.apply('test');
    home.next();
    home.next();
    expect(skips).toBe(0); // ホーム以外ではカウントしない
    home.destroy();
  });

  it('does nothing to the DOM when disabled', () => {
    setUrl('https://www.youtube.com/');
    mountHome(3);
    const home = createHomeController({
      getSettings: () => settings({ enabled: false }),
      onState: () => {},
      onSkip: () => {},
      isDismissed: () => false,
      dismiss: () => {},
    });
    home.apply('test');
    const tiles = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
    expect(tiles.some((t) => t.hasAttribute('data-tf-tile'))).toBe(false);
    expect(document.documentElement.classList.contains('tf-home')).toBe(false);
    home.destroy();
  });
});

function mountHomeWithDurations(durations: Array<string | null>): void {
  setUrl('https://www.youtube.com/');
  const cards = durations
    .map((d, i) => {
      const badge = d === null ? '' : `<ytd-thumbnail-overlay-time-status-renderer><span id="text">${d}</span></ytd-thumbnail-overlay-time-status-renderer>`;
      return `<ytd-rich-item-renderer><a href="/watch?v=v${i}">${i}</a>${badge}</ytd-rich-item-renderer>`;
    })
    .join('');
  document.body.innerHTML = `<ytd-rich-grid-renderer><div id="contents">${cards}</div></ytd-rich-grid-renderer>`;
}

function visibleHrefs(): string[] {
  return Array.from(document.querySelectorAll('ytd-rich-item-renderer.tf-visible a[href]')).map(
    (a) => a.getAttribute('href')!,
  );
}

describe('home filtering', () => {
  it('duration max=10 shows only videos <=10min, hides LIVE', () => {
    mountHomeWithDurations(['3:20', '12:00', '45:00', null, '8:00']); // v0,v4 <=10min
    const home = createHomeController({
      getSettings: () =>
        settings({ visibleCount: 6, durationFilterEnabled: true, durationMinMinutes: 0, durationMaxMinutes: 10 }),
      onState: () => {},
      onSkip: () => {},
      isDismissed: () => false,
      dismiss: () => {},
    });
    home.apply('test');
    expect(visibleHrefs()).toEqual(['/watch?v=v0', '/watch?v=v4']);
    home.destroy();
  });

  it('hideSkipped: next() dismisses the visible card and it stays hidden', () => {
    mountHomeWithDurations(['3:20', '4:00', '5:00']);
    const dismissedSet = new Set<string>();
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 1, hideSkippedEnabled: true }),
      onState: () => {},
      onSkip: () => {},
      isDismissed: (id) => dismissedSet.has(id),
      dismiss: (ids) => ids.forEach((id) => dismissedSet.add(id)),
    });
    home.apply('test');
    expect(visibleHrefs()).toEqual(['/watch?v=v0']);
    home.next(); // v0 をスキップ → dismiss
    home.apply('after-skip');
    expect(dismissedSet.has('v0')).toBe(true);
    expect(visibleHrefs()).toEqual(['/watch?v=v1']);
    home.destroy();
  });

  it('hideSkipped: rapid double next() skips two distinct videos (no stale window)', () => {
    mountHomeWithDurations(['3:20', '4:00', '5:00']);
    const dismissedSet = new Set<string>();
    let skips = 0;
    const home = createHomeController({
      getSettings: () => settings({ visibleCount: 1, hideSkippedEnabled: true }),
      onState: () => {},
      onSkip: () => { skips += 1; },
      isDismissed: (id) => dismissedSet.has(id),
      dismiss: (ids) => ids.forEach((id) => dismissedSet.add(id)),
    });
    home.apply('test');
    home.next(); // skips v0
    home.next(); // must skip v1, not re-read stale v0
    expect([...dismissedSet].sort()).toEqual(['v0', 'v1']);
    expect(skips).toBe(2);
    home.destroy();
  });

  it('duration filter and hideSkipped compose (both predicates applied)', () => {
    mountHomeWithDurations(['3:20', '8:00', '45:00']); // v0,v1 <=10min; v2 excluded by duration
    const dismissedSet = new Set<string>(['v0']); // v0 excluded by skip
    const home = createHomeController({
      getSettings: () =>
        settings({ visibleCount: 6, durationFilterEnabled: true, durationMinMinutes: 0, durationMaxMinutes: 10, hideSkippedEnabled: true }),
      onState: () => {},
      onSkip: () => {},
      isDismissed: (id) => dismissedSet.has(id),
      dismiss: () => {},
    });
    home.apply('test');
    expect(visibleHrefs()).toEqual(['/watch?v=v1']); // only v1 survives both filters
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

  it('always hides reel/horizontal shelves even when watchVisibleCount > 0', () => {
    setUrl('https://www.youtube.com/watch?v=abc');
    document.body.innerHTML = `
      <ytd-watch-flexy><div id="secondary"><div id="related">
        <ytd-watch-next-secondary-results-renderer><div id="items">
          <ytd-item-section-renderer><div id="contents">
            <yt-lockup-view-model data-id="0"></yt-lockup-view-model>
            <ytd-reel-shelf-renderer data-id="reel"></ytd-reel-shelf-renderer>
            <yt-lockup-view-model data-id="1"></yt-lockup-view-model>
          </div></ytd-item-section-renderer>
        </div></ytd-watch-next-secondary-results-renderer>
      </div></div></ytd-watch-flexy>
    `;
    const watch = createWatchController({ getSettings: () => settings({ watchVisibleCount: 5 }) });
    watch.apply('test');

    const reel = document.querySelector('ytd-reel-shelf-renderer')!;
    expect(reel.classList.contains('tf-hidden')).toBe(true);
    expect(reel.classList.contains('tf-visible')).toBe(false);
    // 動画のおすすめ自体は表示される
    const lockups = Array.from(document.querySelectorAll('yt-lockup-view-model'));
    expect(lockups.every((l) => l.classList.contains('tf-visible'))).toBe(true);
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
