/**
 * 実 youtube.com に対するライブ E2E（スタブなし）。
 * ネットワークが必要で、YouTube 側の変化で不安定になりうるため、
 * 既定のスイート（pnpm test:e2e）からは @live タグで除外し、
 * `pnpm test:e2e:live` で明示実行する。
 *
 * 検証の狙いは、静的フィクスチャでは分からない「実ページで拡張が本当に効いて
 * いるか」— tf-watch の付与と、実 DOM のおすすめ抑制。実 YouTube の広告/自動
 * 再生は非決定的なので、次の 2 層に分けて堅牢化している:
 *
 *  (A) 確定的な中核: 関連サイドバーは「実在するのに拡張 CSS で display:none」。
 *      再生に依存せず初期 DOM に出る要素なので、空振り（vacuous pass）にならない。
 *  (B) ベストエフォート: エンドスクリーン抑制。実際に生成できた時だけ検証し、
 *      広告等で生成に至らなければ (A) に委ねてスキップ扱いにする。
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { home } from '../../lib/adapters';

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

test(
  'LIVE: 実 watch ページで tf-watch が付き、おすすめが抑制される',
  { tag: '@live' },
  async ({ context }) => {
    const page = await context.newPage();
    // 2 カラムの watch レイアウト（サイドバー表示）に必要な幅を確保する。
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(SHORT_VIDEO, { waitUntil: 'domcontentloaded' });
    await dismissConsent(page);
    if (!/\/watch/.test(page.url())) {
      await page.goto(SHORT_VIDEO, { waitUntil: 'domcontentloaded' });
    }

    // (1) 実ページで tf-watch が html に付くか（拡張が動いている前提条件・CSS の土台）
    await expect(page.locator('html')).toHaveClass(/tf-watch/, { timeout: 30_000 });

    // ── (A) 確定的な中核: 関連サイドバーの抑制 ──────────────────────────
    // 既定 watchVisibleCount=0 では、おすすめパネルごと display:none にする。
    const sidebar = page.locator('ytd-watch-next-secondary-results-renderer');

    // まず「おすすめパネルが実在する」ことを確認（＝抑制対象がある。空振り防止）。
    await expect(sidebar).toBeAttached({ timeout: 30_000 });

    // 拡張 CSS が実 DOM にマッチして display:none を効かせていることを直接確認する。
    // 「元々無い/空だから見えない」ではなく「拡張が能動的に隠している」ことの証明。
    const sidebarDisplay = await sidebar.evaluate((el) => getComputedStyle(el).display);
    expect(sidebarDisplay).toBe('none');

    // 否定側: サイドバー内に「見えている」/watch リンクが 1 つも無いこと。
    const visibleSidebarLinks = await sidebar.locator('a[href*="/watch"]:visible').count();
    expect(visibleSidebarLinks).toBe(0);

    // ── (B) ベストエフォート: エンドスクリーン抑制 ──────────────────────
    // 実 YouTube の広告/自動再生に左右されるため、「実際に生成された時だけ」検証する。
    // 生成に至らなければ (A) の確定的検証に委ね、ここは skip 相当で握りつぶす
    //（空振り成功を作らないため、抑制の assert は生成が確認できた時だけ実行）。
    // 注意: 空の器（.ytp-endscreen-content 等）は初期 DOM に存在しうるので、
    // トリガーには「実際に生成されるおすすめタイル / 自動再生カウントダウン」を使う。
    // これらは本編終了近くにのみ DOM へ追加されるため、attached = 本物の生成を意味する。
    const endscreenSelector =
      'a.ytp-modern-videowall-still, a.ytp-videowall-still, .ytp-autonav-endscreen-countdown-overlay';

    // 終盤へシークして再生し、エンドスクリーンを誘発する（ミュート・autoplay 許可済み）。
    await page.evaluate(async () => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      if (!v) {
        return;
      }
      v.muted = true;
      try {
        if (v.duration && isFinite(v.duration)) {
          v.currentTime = Math.max(0, v.duration - 1.5);
        }
        await v.play().catch(() => {});
      } catch {
        /* 再生できない環境でも (A) は成立しているので無視 */
      }
    });

    const endscreenAppeared = await page
      .locator(endscreenSelector)
      .first()
      .waitFor({ state: 'attached', timeout: 40_000 })
      .then(() => true)
      .catch(() => false);

    if (!endscreenAppeared) {
      const note = 'エンドスクリーン未生成（広告/自動再生の非決定性）。抑制検証はスキップし、中核(A)で担保。';
      test.info().annotations.push({ type: 'skip-reason', description: note });
      console.log('LIVE:', note);
      return;
    }

    // 生成された → プレイヤー上に「見えている」おすすめが 0 であることを検証（否定側）。
    // クラス名に依存せず、視認できる /watch リンクを直接数えるのが確実。
    const visibleOnPlayer = await page.evaluate(() => {
      const player = document.querySelector('.html5-video-player') ?? document.body;
      const isVisible = (el: Element) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          parseFloat(s.opacity) > 0.01 &&
          r.width > 40 &&
          r.height > 30
        );
      };
      return [
        ...player.querySelectorAll(
          'a.ytp-modern-videowall-still, a.ytp-videowall-still, a.ytp-ce-covering-overlay, a[href*="/watch"]',
        ),
      ].filter((a) => player.contains(a) && isVisible(a)).length;
    });
    expect(visibleOnPlayer).toBe(0);
  },
);

/**
 * セレクタ腐食ガード: 実 YouTube で、adapters の `home.durationBadge` 候補が
 * 実際に再生時間へ当たることを検証する。スタブ・フィクスチャは我々が作った DOM を
 * 映すだけなので、実サイトの DOM 変更（例: 時間バッジが .ytBadgeShapeText へ移行）で
 * セレクタが全滅しても気づけない。この @live テストが、その「フィルタが全カードを
 * 空にする」クラスの回帰を実サイトで捕まえる唯一の砦。
 *
 * ホームのフィードは未ログインだと描画されないため、未ログインでも確実に動画カードと
 * 時間バッジが出る「検索結果」ページで検証する（バッジ要素の構造はサイト共通）。
 */
test('LIVE: 実 DOM で再生時間バッジのセレクタが当たる（durationBadge のセレクタ腐食ガード）', {
  tag: '@live',
}, async ({ context }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('https://www.youtube.com/results?search_query=lofi', {
    waitUntil: 'domcontentloaded',
  });
  await dismissConsent(page);

  // 動画カード（と時間バッジ）が生成されるまで待つ
  await page.waitForSelector('ytd-video-renderer, ytd-rich-item-renderer', { timeout: 30_000 });
  await page
    .waitForFunction(() => document.querySelectorAll('.ytBadgeShapeText').length > 0, {
      timeout: 30_000,
    })
    .catch(() => {});

  // adapters の実セレクタ列を渡し、各動画カードで readTileDuration 相当を実行して
  // 「時間が取れたカード数」を数える。1 件も取れなければセレクタが実 DOM とズレている。
  const result = await page.evaluate((durationBadge: readonly string[]) => {
    const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
    const parse = (t: string | null): number | null => {
      if (typeof t !== 'string') return null;
      const m = TIME_RE.exec(t.trim());
      if (!m) return null;
      const a = Number(m[1]);
      const b = Number(m[2]);
      const c = m[3] !== undefined ? Number(m[3]) : null;
      if (b > 59 || (c !== null && c > 59)) return null;
      return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
    };
    const readDur = (tile: Element): number | null => {
      for (const sel of durationBadge) {
        for (const el of Array.from(tile.querySelectorAll(sel))) {
          const s = parse(el.textContent);
          if (s !== null) return s;
        }
      }
      return null;
    };
    const cards = Array.from(
      document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer'),
    );
    const withDuration = cards.map(readDur).filter((d) => d !== null).length;
    return { cards: cards.length, withDuration };
  }, home.durationBadge);

  console.log('LIVE durationBadge:', JSON.stringify(result));
  // 通常動画には必ず時間バッジがある。1 件でも取れれば「当たっている」ことの証明。
  // 0 なら home.durationBadge が実 DOM とズレている（＝フィルタが全カードを空にする回帰）。
  expect(result.cards).toBeGreaterThan(0);
  expect(result.withDuration).toBeGreaterThan(0);
});
