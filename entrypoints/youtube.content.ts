import { defineContentScript } from 'wxt/sandbox';
import '../lib/content/content.css';

import { DEFAULTS, readSettings, watchSettings, type Settings } from '../lib/settings';
import {
  isTubeFlowMessage,
  type CommandResponse,
  type TubeFlowMessage,
} from '../lib/messaging';
import { isHomePage, isWatchPage, onNavigation } from '../lib/page';
import { createHomeController } from '../lib/content/home';
import { createWatchController } from '../lib/content/watch';
import { mountControls, type Controls } from '../lib/content/controls';
import { createBlocker } from '../lib/content/blocker';
import { createUsageTracker } from '../lib/usage';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',

  main() {
    // 設定ロード前は「有効」と仮定して即マスク（フリッカー防止）。無効なら後で解除される。
    applyPrehideFlags(true);

    let settings: Settings = { ...DEFAULTS };
    const getSettings = () => settings;

    let controls: Controls | null = null;

    // 視聴秒数・「次へ」回数を保持する使用量トラッカー（storage.local, 日次リセット）
    const usage = createUsageTracker();

    const home = createHomeController({
      getSettings,
      onState: () => controls?.refresh(),
      onSkip: () => {
        usage.addSkip();
        void usage.flush();
        controls?.refresh();
      },
    });
    const watch = createWatchController({ getSettings });
    const blocker = createBlocker({ getSettings, usage });
    blocker.start();

    function applyAll(reason: string): void {
      home.apply(reason);
      watch.apply(reason);
      controls?.refresh();
      blocker.refresh();
    }

    function ensureControls(): void {
      if (controls || !document.body) {
        return;
      }
      controls = mountControls({
        next: () => home.next(),
        getSnapshot: () => home.getSnapshot(),
        getSkips: () => usage.skips(),
      });
    }

    // 使用量を読み込んで UI に反映
    void usage.load().then(() => {
      controls?.refresh();
      blocker.refresh();
    });

    // 初期化
    void readSettings().then((loaded) => {
      settings = loaded;
      applyPrehideFlags(loaded.enabled);
      ensureControls();
      applyAll('init');
    });

    // 設定変更を購読して即反映
    watchSettings((next) => {
      settings = next;
      applyPrehideFlags(next.enabled);
      applyAll('settings-change');
    });

    // background からのコマンド / popup からの通知
    chrome.runtime.onMessage.addListener(
      (message: unknown, _sender, sendResponse: (response: CommandResponse) => void) => {
        if (!isTubeFlowMessage(message)) {
          return;
        }
        handleMessage(message, sendResponse);
        return true;
      },
    );

    function handleMessage(
      message: TubeFlowMessage,
      sendResponse: (response: CommandResponse) => void,
    ): void {
      if (!settings.enabled && message.type !== 'options-updated') {
        sendResponse({ ok: false, disabled: true });
        return;
      }
      switch (message.type) {
        case 'command-next':
          home.next();
          sendResponse({ ok: true });
          break;
        case 'command-watch-later':
          void home.addCurrentToWatchLater().then((ok) => sendResponse({ ok }));
          break;
        case 'command-not-interested':
          void home.markCurrentAsNotInterested().then((ok) => sendResponse({ ok }));
          break;
        case 'options-updated':
          void readSettings().then((next) => {
            settings = next;
            applyPrehideFlags(next.enabled);
            applyAll('options-update');
          });
          sendResponse({ ok: true });
          break;
      }
    }

    // SPA ナビゲーション
    onNavigation({
      start: () => applyPrehideFlags(settings.enabled),
      finish: () => {
        home.resetCursor();
        applyAll('navigate');
      },
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureControls, { once: true });
    } else {
      ensureControls();
    }
  },
});

/** URL と有効フラグから html のマスク用クラスを同期する（document_start でも安全） */
function applyPrehideFlags(enabled: boolean): void {
  const html = document.documentElement;
  if (!html) {
    return;
  }
  html.classList.toggle('tf-home', enabled && isHomePage());
  html.classList.toggle('tf-watch', enabled && isWatchPage());
  if (!enabled) {
    html.classList.remove('tf-ready', 'tf-watch-ready', 'tf-hide-shorts', 'tf-watch-hide-all');
  }
  // 遷移時は準備状態をリセットして再マスク
  html.classList.remove('tf-ready');
  if (!isWatchPage()) {
    html.classList.remove('tf-watch-ready');
  }
}
