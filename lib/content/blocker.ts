/**
 * 利用制限の実行部。
 *  - /watch で動画が再生中かつタブが可視のときだけ視聴秒数を加算
 *  - 時間帯ブロック or 1 日視聴上限に達したら遮断オーバーレイを表示し、動画を停止
 * スヌーズ（一時解除）は無し。設定を変えない限りブロックは解けない。
 */
import type { Settings } from '../settings';
import { isWatchPage } from '../page';
import { activeWindowEnd, dailyLimitSeconds, evaluateBlock, type BlockReason } from '../restrictions';
import { createUsageTracker, formatMinutes, type UsageTracker } from '../usage';

const OVERLAY_ID = 'tf-block-overlay';
const FLUSH_EVERY = 5; // 秒

interface BlockerDeps {
  getSettings: () => Settings;
}

export interface Blocker {
  start(): void;
  /** 設定変更時などに即再評価する */
  refresh(): void;
  destroy(): void;
}

export function createBlocker(deps: BlockerDeps): Blocker {
  const usage: UsageTracker = createUsageTracker();
  let ticker: ReturnType<typeof setInterval> | null = null;
  let sinceFlush = 0;
  let started = false;

  function mainVideo(): HTMLVideoElement | null {
    return document.querySelector<HTMLVideoElement>('video.html5-main-video, video');
  }

  function isVideoPlaying(): boolean {
    if (!isWatchPage() || document.visibilityState !== 'visible') {
      return false;
    }
    const v = mainVideo();
    return Boolean(v && !v.paused && !v.ended && v.readyState >= 2 && v.currentTime > 0);
  }

  function reasonLabel(reason: Exclude<BlockReason, null>): { title: string; detail: string } {
    const settings = deps.getSettings();
    if (reason === 'schedule') {
      const end = activeWindowEnd(settings, new Date());
      return {
        title: 'いまは YouTube を見ない時間です',
        detail: end ? `${end} まで Tube Flow が遮断しています` : 'Tube Flow が遮断しています',
      };
    }
    const limitMin = Math.floor(dailyLimitSeconds(settings) / 60);
    return {
      title: '今日の視聴時間の上限に達しました',
      detail: `本日 ${formatMinutes(usage.seconds())} 視聴（上限 ${limitMin}分）／ 翌 0 時にリセット`,
    };
  }

  function showOverlay(reason: Exclude<BlockReason, null>): void {
    const { title, detail } = reasonLabel(reason);
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-live', 'assertive');
      overlay.innerHTML = `
        <div class="tf-block-card">
          <div class="tf-block-mark" aria-hidden="true">⏸</div>
          <h1 class="tf-block-title"></h1>
          <p class="tf-block-detail"></p>
          <p class="tf-block-foot">Tube Flow の利用制限</p>
        </div>
      `;
      (document.body ?? document.documentElement).appendChild(overlay);
    }
    const titleEl = overlay.querySelector('.tf-block-title');
    const detailEl = overlay.querySelector('.tf-block-detail');
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
    overlay.dataset.reason = reason;
    // 視聴時間を止めるため動画も停止
    mainVideo()?.pause();
  }

  function hideOverlay(): void {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function enforce(): void {
    const reason = evaluateBlock(deps.getSettings(), usage.seconds(), new Date());
    if (reason) {
      showOverlay(reason);
    } else {
      hideOverlay();
    }
  }

  function tick(): void {
    if (isVideoPlaying()) {
      usage.add(1);
      if (++sinceFlush >= FLUSH_EVERY) {
        sinceFlush = 0;
        void usage.flush();
      }
    }
    enforce();
  }

  return {
    start(): void {
      if (started) {
        return;
      }
      started = true;
      void usage.load().then(() => enforce());
      ticker = setInterval(tick, 1000);
      document.addEventListener('visibilitychange', enforce);
    },
    refresh: enforce,
    destroy(): void {
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
      document.removeEventListener('visibilitychange', enforce);
      void usage.flush();
      usage.destroy();
      hideOverlay();
    },
  };
}
