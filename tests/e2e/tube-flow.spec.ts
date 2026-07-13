import { test, expect, stubYouTube, seedStorage } from './fixtures';

test.describe('Tube Flow (built extension)', () => {
  test('home: shows only the first tile and hides the rest', async ({ context }) => {
    await stubYouTube(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');

    await page.waitForSelector('html.tf-home.tf-ready', { timeout: 15_000 });

    const counts = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('[data-tf-tile]'));
      return {
        total: tiles.length,
        visible: tiles.filter((t) => t.classList.contains('tf-visible')).length,
        hidden: tiles.filter((t) => t.classList.contains('tf-hidden')).length,
      };
    });
    expect(counts.total).toBeGreaterThan(1);
    expect(counts.visible).toBe(1);
    expect(counts.hidden).toBe(counts.total - 1);

    // 「その他のトピック」相当のセクション棚が実 CSS で非表示になっている
    const sectionHidden = await page.evaluate(() => {
      const section = document.querySelector('ytd-rich-section-renderer');
      return section ? getComputedStyle(section).display === 'none' : false;
    });
    expect(sectionHidden).toBe(true);

    // 表示カードは中央寄せ（管理ルートに justify-content: center が効く）
    const justify = await page.evaluate(() => {
      const root = document.querySelector('#contents.tf-managed-root');
      return root ? getComputedStyle(root).justifyContent : null;
    });
    expect(justify).toBe('center');
  });

  test('home: mini controls are mounted and "next" advances the cursor', async ({ context }) => {
    await stubYouTube(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');

    const controls = page.locator('.tf-controls');
    await expect(controls).toHaveAttribute('data-visible', 'true');

    // 最初は index 0 が表示
    const firstVisible = () =>
      page.evaluate(() => {
        const visible = document.querySelector('[data-tf-tile].tf-visible') as HTMLElement | null;
        return visible?.getAttribute('data-id') ?? null;
      });
    expect(await firstVisible()).toBe('0');

    await controls.locator('button[data-action="next"]').click();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const visible = document.querySelector('[data-tf-tile].tf-visible') as HTMLElement | null;
          return visible?.getAttribute('data-id') ?? null;
        }),
      )
      .toBe('1');
  });

  test('home: per-card 興味なし button opens the menu and executes the action', async ({
    context,
  }) => {
    await stubYouTube(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');

    const notInterested = page.locator(
      '[data-tf-tile].tf-visible .tf-card-actions button[data-tf-action="not-interested"]',
    );
    await expect(notInterested).toBeVisible();
    await notInterested.click();

    // メニューが開くだけでなく、項目クリックまで到達して data 属性が立つ
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .querySelector('[data-tf-tile].tf-visible')
              ?.getAttribute('data-not-interested') ?? null,
        ),
      )
      .toBe('1');
  });

  test('home: per-card 後で見る button executes the action', async ({ context }) => {
    await stubYouTube(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');

    await page
      .locator('[data-tf-tile].tf-visible .tf-card-actions button[data-tf-action="watch-later"]')
      .click();

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector('[data-tf-tile].tf-visible')?.getAttribute('data-watch-later') ??
            null,
        ),
      )
      .toBe('1');
  });

  test('watch: hides the recommendations panel by default (watchVisibleCount = 0)', async ({
    context,
  }) => {
    await stubYouTube(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=abc');

    await page.waitForSelector('html.tf-watch.tf-watch-ready', { timeout: 15_000 });
    await expect(page.locator('html')).toHaveClass(/tf-watch-hide-all/);

    // ネストされたおすすめが視覚的に隠れている
    const panelVisible = await page.evaluate(() => {
      const panel = document.querySelector('ytd-watch-next-secondary-results-renderer');
      if (!panel) return true;
      return getComputedStyle(panel).display !== 'none';
    });
    expect(panelVisible).toBe(false);

    // 再生後のおすすめ（エンドスクリーン）2 系統が両方とも非表示
    const endscreenDisplays = await page.evaluate(() => {
      const disp = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).display : 'missing';
      };
      return {
        videowall: disp('.ytp-endscreen-content'),
        autonav: disp('.ytp-autonav-endscreen-countdown-overlay'),
      };
    });
    expect(endscreenDisplays.videowall).toBe('none');
    expect(endscreenDisplays.autonav).toBe('none');
  });
});

test.describe('Tube Flow settings propagation', () => {
  test('home: visibleCount = 3 shows 3 cards with per-card buttons; "次へ" pages by 3', async ({
    context,
    extensionId,
  }) => {
    await stubYouTube(context);

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.fill('#visibleCount', '3');
    await optionsPage.click('button[type="submit"]');
    await optionsPage.waitForFunction(() =>
      document.getElementById('status')?.textContent?.includes('保存'),
    );
    await optionsPage.close();

    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');

    // 3 枚表示、それぞれに個別ボタン（後で見る/興味なし = 2 個）
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll('[data-tf-tile].tf-visible').length))
      .toBe(3);
    const perCard = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-tf-tile].tf-visible')).map(
        (t) => t.querySelectorAll('.tf-card-actions [data-tf-action]').length,
      ),
    );
    expect(perCard).toEqual([2, 2, 2]);

    const firstVisibleId = () =>
      page.evaluate(
        () =>
          document.querySelector('[data-tf-tile].tf-visible')?.getAttribute('data-id') ?? null,
      );
    expect(await firstVisibleId()).toBe('0');

    // 「次へ」で表示枚数ぶん送る（5 枚・window3 なので末尾クランプで先頭が 2 に）
    await page.locator('.tf-controls button[data-action="next"]').click();
    await expect.poll(firstVisibleId).toBe('2');
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll('[data-tf-tile].tf-visible').length))
      .toBe(3);
  });

  test('home: cardWidth sets the visible card size (CSS var + tile width)', async ({
    context,
    extensionId,
  }) => {
    await stubYouTube(context);

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.fill('#cardWidth', '500');
    await optionsPage.click('button[type="submit"]');
    await optionsPage.waitForFunction(() =>
      document.getElementById('status')?.textContent?.includes('保存'),
    );
    await optionsPage.close();

    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');

    // html に CSS 変数が反映される
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--tf-card-width').trim(),
        ),
      )
      .toBe('500px');
    // 表示中カードの実幅が設定値になる（コンテナ幅 > 500 の前提）
    const width = await page.evaluate(() => {
      const tile = document.querySelector('[data-tf-tile].tf-visible') as HTMLElement | null;
      return tile ? getComputedStyle(tile).width : null;
    });
    expect(width).toBe('500px');
  });

  test('home: reaching skipCloseThreshold closes the tab', async ({ context, extensionId }) => {
    await stubYouTube(context);

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.fill('#visibleCount', '1');
    await optionsPage.fill('#skipCloseThreshold', '1');
    await optionsPage.click('button[type="submit"]');
    await optionsPage.waitForFunction(() =>
      document.getElementById('status')?.textContent?.includes('保存'),
    );
    await optionsPage.close();

    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');

    // threshold=1: 1 回「次へ」でスキップ上限 → バックグラウンドがタブを閉じる
    const closed = page.waitForEvent('close', { timeout: 15_000 });
    await page.locator('.tf-controls button[data-action="next"]').click();
    await closed;
    expect(page.isClosed()).toBe(true);
  });

  test('watch: watchVisibleCount = 2 reveals exactly 2 nested recommendations', async ({
    context,
    extensionId,
  }) => {
    await stubYouTube(context);

    // 設定を先に書き込む（options ページ経由で chrome.storage.sync に保存）
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.fill('#watchVisibleCount', '2');
    await optionsPage.click('button[type="submit"]');
    await optionsPage.waitForFunction(() => {
      const s = document.getElementById('status');
      return s?.textContent?.includes('保存');
    });
    await optionsPage.close();

    const page = await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=abc');
    await page.waitForSelector('html.tf-watch.tf-watch-ready');

    await expect(page.locator('html')).not.toHaveClass(/tf-watch-hide-all/);
    await expect
      .poll(async () =>
        page.evaluate(
          () => document.querySelectorAll('[data-tf-rec].tf-visible').length,
        ),
      )
      .toBe(2);
    const hidden = await page.evaluate(
      () => document.querySelectorAll('[data-tf-rec].tf-hidden').length,
    );
    expect(hidden).toBe(3);
  });
});

test.describe('Tube Flow 利用制限', () => {
  test('schedule: an active time window shows the block overlay', async ({ context, extensionId }) => {
    // 00:00–23:59 は（23:59 の 1 分を除き）常に有効 → いつ実行しても遮断される
    await seedStorage(context, extensionId, {
      scheduleBlockEnabled: true,
      blockWindows: [{ start: '00:00', end: '23:59' }],
    });
    await stubYouTube(context);

    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    const overlay = page.locator('#tf-block-overlay');
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(overlay).toHaveAttribute('data-reason', 'schedule');
  });

  test('daily-limit: exceeding the daily watch limit shows the block overlay', async ({
    context,
    extensionId,
  }) => {
    // 上限 5 分（最小値）、今日の視聴 600 秒 → 上限超過で遮断
    await seedStorage(
      context,
      extensionId,
      { dailyLimitEnabled: true, dailyLimitMinutes: 5 },
      600,
    );
    await stubYouTube(context);

    const page = await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=abc');
    const overlay = page.locator('#tf-block-overlay');
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(overlay).toHaveAttribute('data-reason', 'daily-limit');
  });

  test('no restriction: overlay is absent by default', async ({ context }) => {
    await stubYouTube(context);
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForSelector('html.tf-home.tf-ready');
    await expect(page.locator('#tf-block-overlay')).toHaveCount(0);
  });
});
