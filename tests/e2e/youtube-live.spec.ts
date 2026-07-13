/**
 * 実 youtube.com に対するライブ E2E（スタブなし）。
 * ネットワークが必要で、YouTube 側の変化で不安定になりうるため、
 * 既定のスイートからは testIgnore で除外し、`pnpm test:e2e:live` で明示実行する。
 *
 * ここで検証したいのは、静的フィクスチャでは分からない「実ページで
 * 拡張が本当に効いているか」— tf-watch の付与や再生後エンドスクリーンの抑制。
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const SHORT_VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Me at the zoo (19s)

test.describe.configure({ timeout: 120_000 });

/** consent.youtube.com が出たら（プライバシー優先で）拒否して先へ進む */
async function dismissConsent(page: Page): Promise<void> {
  if (!/consent\.youtube\.com|consent\.google\.com/.test(page.url())) {
    return;
  }
  const candidates = [
    'button[aria-label*="Reject all" i]',
    'button[aria-label*="すべて拒否" i]',
    'button:has-text("Reject all")',
    'button:has-text("すべて拒否")',
    'button:has-text("拒否")',
  ];
  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return;
    }
  }
}

test('LIVE: watch ページで tf-watch が付き、再生後のエンドスクリーンが隠れる', {
  tag: '@live',
}, async ({ context }) => {
  const page = await context.newPage();
  await page.goto(SHORT_VIDEO, { waitUntil: 'domcontentloaded' });
  await dismissConsent(page);
  if (!/\/watch/.test(page.url())) {
    await page.goto(SHORT_VIDEO, { waitUntil: 'domcontentloaded' });
  }

  // (1) 実ページで tf-watch が html に付くか（CSS が効く前提条件）
  await expect(page.locator('html')).toHaveClass(/tf-watch/, { timeout: 30_000 });

  // (2) 本編の video を取得（広告中はスキップを待つ）
  await page.waitForSelector('video', { timeout: 30_000 });
  await page
    .waitForFunction(
      () => {
        const p = document.querySelector('.html5-video-player');
        const v = document.querySelector('video') as HTMLVideoElement | null;
        return !!v && !!v.duration && !p?.classList.contains('ad-showing');
      },
      { timeout: 45_000 },
    )
    .catch(() => {});

  // (3) 終盤へシークして動画を終わらせ、エンドスクリーンを出す
  await page.evaluate(async () => {
    const v = document.querySelector('video') as HTMLVideoElement;
    v.muted = true;
    if (v.duration) {
      v.currentTime = Math.max(0, v.duration - 1.2);
      await v.play().catch(() => {});
    }
  });
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.ended, {
    timeout: 30_000,
  });

  // エンドスクリーン要素が現れるまで待つ（本編終了後に生成される）
  await page
    .waitForSelector('.ytp-endscreen-content, .ytp-autonav-endscreen-countdown-overlay', {
      timeout: 15_000,
      state: 'attached',
    })
    .catch(() => {});

  // (4) 現れたエンドスクリーンが実 CSS で非表示になっているか
  const result = await page.evaluate(() => {
    const disp = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      return el ? getComputedStyle(el).display : 'missing';
    };
    return {
      tf: (document.documentElement.className.match(/tf-[\w-]+/g) || []),
      videowall: disp('.ytp-endscreen-content'),
      autonav: disp('.ytp-autonav-endscreen-countdown-overlay'),
    };
  });
  console.log('LIVE result:', JSON.stringify(result));

  // 出ていれば none であること（要素が無い＝missing は許容）
  if (result.videowall !== 'missing') {
    expect(result.videowall).toBe('none');
  }
  if (result.autonav !== 'missing') {
    expect(result.autonav).toBe('none');
  }
  // 少なくともどちらか一方はエンドスクリーンが生成され、隠れていること
  expect(result.videowall === 'none' || result.autonav === 'none').toBe(true);
});
