const { readFile } = require('fs/promises');
const path = require('path');
const { test, expect } = require('./fixtures');

const HOME_FIXTURE_HTML = path.join(__dirname, '..', 'fixtures', 'static', 'youtube-home.html');
const WATCH_FIXTURE_HTML = path.join(__dirname, '..', 'fixtures', 'static', 'youtube-watch.html');

async function stubYouTube(page) {
  const [homeHtml, watchHtml] = await Promise.all([
    readFile(HOME_FIXTURE_HTML, 'utf-8'),
    readFile(WATCH_FIXTURE_HTML, 'utf-8')
  ]);
  await page.route('**://www.youtube.com/**', (route) => {
    const request = route.request();
    const type = request.resourceType();
    if (type === 'document') {
      const url = request.url();
      const body = /\/watch/.test(url) ? watchHtml : homeHtml;
      route.fulfill({
        status: 200,
        body,
        contentType: 'text/html; charset=utf-8'
      });
      return;
    }
    if (request.method() === 'GET') {
      route.fulfill({ status: 204, body: '' });
      return;
    }
    route.fallback();
  });
}

test.describe('Tube Flow integration', () => {
  test('restricts visible tiles and handles UI controls', async ({ context }) => {
    const page = await context.newPage();
    await stubYouTube(page);
    await page.goto('https://www.youtube.com/');

    await page.waitForSelector('ytd-rich-item-renderer');
    await page.waitForSelector('.hd-controls');
    await page.waitForFunction(() => !!document.querySelector('ytd-rich-item-renderer.hd-hidden'));

    const hiddenCount = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
      return tiles.filter((tile) => tile.classList.contains('hd-hidden')).length;
    });
    expect(hiddenCount).toBe(4);

    const shortsHidden = await page.evaluate(() => {
      const shelf = document.querySelector('ytd-reel-shelf-renderer');
      return shelf?.classList.contains('hd-hidden');
    });
    expect(shortsHidden).toBe(true);

    await page.click('.hd-controls button[data-action="next"]');
    await page.waitForFunction(() => {
      const tiles = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
      return tiles.findIndex((tile) => !tile.classList.contains('hd-hidden')) === 1;
    });
    const activeIndexAfterNext = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
      const visible = tiles.findIndex((tile) => !tile.classList.contains('hd-hidden'));
      return visible;
    });
    expect(activeIndexAfterNext).toBe(1);

    await page.click('.hd-controls button[data-action="watch-later"]');
    const clickedWatchLater = await page.evaluate(() => {
      const tile = Array.from(document.querySelectorAll('ytd-rich-item-renderer'))
        .find((el) => !el.classList.contains('hd-hidden'));
      const button = tile?.querySelector('.watch-later');
      return button?.dataset?.clicked === 'true';
    });
    expect(clickedWatchLater).toBe(true);

    await page.click('.hd-controls button[data-action="not-interested"]');
    const clickedNotInterested = await page.evaluate(() => {
      const tile = Array.from(document.querySelectorAll('ytd-rich-item-renderer'))
        .find((el) => !el.classList.contains('hd-hidden'));
      const button = tile?.querySelector('.not-interested');
      return button?.dataset?.clicked === 'true';
    });
    expect(clickedNotInterested).toBe(true);
  });

  test('applies settings changes from options page', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__tubeFlowReady = false;
      if (window.TubeFlow?.core?.getState) {
        window.__tubeFlowReady = true;
      } else {
        window.addEventListener('tube-flow:core-ready', () => {
          window.__tubeFlowReady = true;
        }, { once: true });
      }
    });
    await stubYouTube(page);
    await page.goto('https://www.youtube.com/');

    await page.waitForSelector('ytd-rich-item-renderer');
    await page.waitForFunction(() => window.__tubeFlowReady === true);

    const initialSnapshot = await page.evaluate(() => ({
      visibleCount: Array.from(document.querySelectorAll('ytd-rich-item-renderer')).filter((tile) => !tile.classList.contains('hd-hidden')).length,
      rootClasses: Array.from(document.documentElement.classList),
      skipLabel: document.querySelector('[data-role="skip-remaining"]')?.textContent || ''
    }));

    expect(initialSnapshot.visibleCount).toBe(1);
    expect(initialSnapshot.rootClasses).toContain('hd-hide-shorts');
    expect(initialSnapshot.skipLabel).toContain('残り');

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`);
    await optionsPage.waitForSelector('#options-form');

    await optionsPage.fill('#visibleCount', '2');
    await optionsPage.fill('#watchVisibleCount', '2');
    await optionsPage.fill('#skipCloseThreshold', '5');
    const hideShortsCheckbox = optionsPage.locator('#hideShorts');
    if (await hideShortsCheckbox.isChecked()) {
      await hideShortsCheckbox.click();
    }
    await optionsPage.click('button[type="submit"]');

    await page.waitForFunction(() => {
      const tiles = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
      const visibleCount = tiles.filter((tile) => !tile.classList.contains('hd-hidden')).length;
      const hideShortsOff = !document.documentElement.classList.contains('hd-hide-shorts');
      const skipLabel = document.querySelector('[data-role="skip-remaining"]')?.textContent || '';
      return visibleCount === 2 && hideShortsOff && /残り5/.test(skipLabel);
    });

    const postState = await optionsPage.evaluate(() => ({
      summary: document.getElementById('summary')?.innerText || ''
    }));

    expect(postState.summary).toMatch(/表示カード数\s*2/);
    expect(postState.summary).toMatch(/Shorts 非表示\s*無効/);
    expect(postState.summary).toMatch(/連続スキップ回数\s*5/);
    expect(postState.summary).toMatch(/おすすめ表示数\s*2/);

    await optionsPage.click('#restore-defaults');

    await page.waitForFunction(() => {
      const tiles = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
      const visibleCount = tiles.filter((tile) => !tile.classList.contains('hd-hidden')).length;
      const hideShortsOn = document.documentElement.classList.contains('hd-hide-shorts');
      const skipLabel = document.querySelector('[data-role="skip-remaining"]')?.textContent || '';
      return visibleCount === 1 && hideShortsOn && /残り3/.test(skipLabel);
    });

    const restoredSummary = await optionsPage.evaluate(() => document.getElementById('summary')?.innerText || '');
    expect(restoredSummary).toMatch(/表示カード数\s*1/);
    expect(restoredSummary).toMatch(/Shorts 非表示\s*有効/);
    expect(restoredSummary).toMatch(/連続スキップ回数\s*3/);
    expect(restoredSummary).toMatch(/おすすめ表示数\s*0/);
  });

  test('limits watch recommendations according to settings', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await stubYouTube(page);
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    await page.waitForSelector('#related ytd-watch-next-secondary-results-renderer #items > yt-lockup-view-model', { state: 'attached' });

    await page.waitForFunction(() => {
      const items = Array.from(document.querySelectorAll('#related ytd-watch-next-secondary-results-renderer #items > *'));
      return items.length >= 4 && items.every((item) => item.classList.contains('hd-hidden'));
    });

    const initialState = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#related ytd-watch-next-secondary-results-renderer #items > *'));
      const visible = items.filter((item) => !item.classList.contains('hd-hidden')).length;
      const hasRootClass = document.documentElement.classList.contains('hd-watch-target');
      const endscreenDisplay = (() => {
        const el = document.getElementById('endscreen-mock');
        if (!el) return null;
        return window.getComputedStyle(el).display;
      })();
      return { total: items.length, visible, hasRootClass, endscreenDisplay };
    });

    expect(initialState.total).toBeGreaterThanOrEqual(4);
    expect(initialState.visible).toBe(0);
    expect(initialState.hasRootClass).toBe(true);
    expect(initialState.endscreenDisplay).toBe('none');

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`);
    await optionsPage.waitForSelector('#watchVisibleCount');
    await optionsPage.fill('#watchVisibleCount', '3');
    await optionsPage.click('button[type="submit"]');

    await page.waitForFunction(() => {
      const items = Array.from(document.querySelectorAll('#related ytd-watch-next-secondary-results-renderer #items > *'));
      const visibleIds = items.filter((item) => !item.classList.contains('hd-hidden')).map((item) => item.id);
      return items.length >= 4 && visibleIds.length === 3 && visibleIds.includes('auto-item');
    });

    const updatedState = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#related ytd-watch-next-secondary-results-renderer #items > *'));
      const visibleIds = items.filter((item) => !item.classList.contains('hd-hidden')).map((item) => item.id);
      const endscreenDisplay = (() => {
        const el = document.getElementById('endscreen-mock');
        if (!el) return null;
        return window.getComputedStyle(el).display;
      })();
      return { visibleIds, endscreenDisplay };
    });

    expect(updatedState.visibleIds).toEqual(expect.arrayContaining(['auto-item', 'item-1', 'item-2']));
    expect(updatedState.visibleIds.length).toBe(3);
    expect(updatedState.endscreenDisplay).toBe('none');

    await optionsPage.click('#restore-defaults');

    await page.waitForFunction(() => {
      const items = Array.from(document.querySelectorAll('#related ytd-watch-next-secondary-results-renderer #items > *'));
      const endscreen = document.getElementById('endscreen-mock');
      const endscreenHidden = endscreen ? window.getComputedStyle(endscreen).display === 'none' : true;
      return items.length >= 4 && items.every((item) => item.classList.contains('hd-hidden')) && endscreenHidden;
    });
  });
});
