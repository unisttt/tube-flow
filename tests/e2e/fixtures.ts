import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(dirname, '..', '..', '.output', 'chrome-mv3');
const fixturesDir = path.resolve(dirname, '..', 'fixtures');

/**
 * ビルド済み拡張（.output/chrome-mv3）を読み込んだ永続コンテキストを提供する。
 * `pnpm build` を事前に実行しておくこと。
 */
export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    // 拡張の読み込みには full chromium が必要（headless-shell は非対応）。
    // headless:false + --headless=new で、ディスプレイ無しでも新ヘッドレスとして起動する。
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
        // ライブ E2E で video.play() をジェスチャ無しに許可（ミュート前提）。
        // これが無いと実 YouTube で再生が始まらず、エンドスクリーンに到達しない。
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    const extensionId = worker.url().split('/')[2]!;
    await use(extensionId);
  },
});

export const expect = test.expect;

/**
 * 拡張ページの文脈で chrome.storage を直接セットする。
 * sync に設定、local に今日の視聴秒数（seconds 指定時）を書き込む。
 */
export async function seedStorage(
  context: BrowserContext,
  extensionId: string,
  sync: Record<string, unknown>,
  seconds?: number,
): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate(
    async ({ sync, seconds }) => {
      await chrome.storage.sync.set(sync);
      if (typeof seconds === 'number') {
        const d = new Date();
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`;
        await chrome.storage.local.set({ 'tubeflow-usage': { date: key, seconds } });
      }
    },
    { sync, seconds },
  );
  await page.close();
}

/** www.youtube.com へのリクエストをローカルの静的フィクスチャで応答する */
export async function stubYouTube(context: BrowserContext): Promise<void> {
  const [homeHtml, watchHtml] = await Promise.all([
    readFile(path.join(fixturesDir, 'youtube-home.html'), 'utf-8'),
    readFile(path.join(fixturesDir, 'youtube-watch.html'), 'utf-8'),
  ]);
  await context.route('**://www.youtube.com/**', (route) => {
    const request = route.request();
    if (request.resourceType() === 'document') {
      const body = /\/watch/.test(request.url()) ? watchHtml : homeHtml;
      return route.fulfill({ status: 200, body, contentType: 'text/html; charset=utf-8' });
    }
    if (request.method() === 'GET') {
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
}
