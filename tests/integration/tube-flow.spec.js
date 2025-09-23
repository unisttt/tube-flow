const { readFile } = require('fs/promises');
const path = require('path');
const { test, expect } = require('./fixtures');

const FIXTURE_HTML = path.join(__dirname, '..', 'fixtures', 'static', 'youtube-home.html');

async function stubYouTube(page) {
  const html = await readFile(FIXTURE_HTML, 'utf-8');
  await page.route('**://www.youtube.com/**', (route) => {
    const request = route.request();
    const type = request.resourceType();
    if (type === 'document') {
      route.fulfill({
        status: 200,
        body: html,
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
  });
});
