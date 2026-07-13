/**
 * 視聴ページ（/watch）のおすすめ制御。
 * 旧実装は `#items` 直下前提だったが、現在は `ytd-item-section-renderer` に
 * ネストされるため、コンテナ配下を deep 走査して属性ベースで制御する。
 */
import type { Settings } from '../settings';
import { isWatchPage } from '../page';
import * as sel from '../adapters';
import { queryFirst } from '../adapters';

const REC_ATTR = 'data-tf-rec';

export interface WatchController {
  apply(reason: string): void;
  destroy(): void;
}

interface WatchDeps {
  getSettings: () => Settings;
}

export function createWatchController(deps: WatchDeps): WatchController {
  let container: Element | null = null;
  let marked: Element[] = [];
  let observer: MutationObserver | null = null;
  let applyTimer: ReturnType<typeof setTimeout> | null = null;
  let rootRetryTimer: ReturnType<typeof setTimeout> | null = null;

  const recSelector = sel.watch.recommendation.join(', ');
  const alwaysHideSelector = sel.watch.alwaysHide.join(', ');

  const html = () => document.documentElement;
  const setFlag = (name: string, on: boolean) => html().classList.toggle(name, on);

  function scheduleApply(reason: string): void {
    if (applyTimer) {
      return;
    }
    applyTimer = setTimeout(() => {
      applyTimer = null;
      apply(reason);
    }, 120);
  }

  function requestRootRetry(): void {
    if (rootRetryTimer) {
      return;
    }
    rootRetryTimer = setTimeout(() => {
      rootRetryTimer = null;
      scheduleApply('root-retry');
    }, 400);
  }

  function clearRootRetry(): void {
    if (rootRetryTimer) {
      clearTimeout(rootRetryTimer);
      rootRetryTimer = null;
    }
  }

  function disconnectObserver(): void {
    observer?.disconnect();
  }

  function reconnectObserver(): void {
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
            scheduleApply('mutation');
            break;
          }
        }
      });
    }
    if (!container) {
      disconnectObserver();
      return;
    }
    observer.disconnect();
    try {
      observer.observe(container, { childList: true, subtree: true });
    } catch (error) {
      console.warn('[TubeFlow][watch] observer attach failed', error);
    }
  }

  function ensureContainer(): Element | null {
    if (!isWatchPage()) {
      disconnectObserver();
      container = null;
      return null;
    }
    const next = queryFirst(sel.watch.containerCandidates);
    if (!next) {
      return null;
    }
    if (container !== next) {
      container = next;
      reconnectObserver();
    }
    clearRootRetry();
    return container;
  }

  function clearDecorations(): void {
    for (const el of marked) {
      el.classList.remove('tf-visible', 'tf-hidden');
      el.removeAttribute(REC_ATTR);
    }
    marked = [];
  }

  function apply(reason: string): void {
    const settings = deps.getSettings();

    if (!isWatchPage() || !settings.enabled) {
      setFlag('tf-watch', false);
      setFlag('tf-watch-ready', false);
      setFlag('tf-watch-hide-all', false);
      clearDecorations();
      disconnectObserver();
      container = null;
      clearRootRetry();
      return;
    }

    setFlag('tf-watch', true);
    const visibleCount = Math.max(0, Number(settings.watchVisibleCount) || 0);

    // 0 件ならおすすめパネルごと隠す（最も堅牢、ネスト非依存）
    setFlag('tf-watch-hide-all', visibleCount === 0);

    const root = ensureContainer();
    if (!root) {
      setFlag('tf-watch-ready', false);
      requestRootRetry();
      return;
    }

    clearDecorations();

    if (visibleCount > 0) {
      const recommendations = Array.from(root.querySelectorAll(recSelector));
      let shown = 0;
      for (const el of recommendations) {
        const forceHide = el.matches(alwaysHideSelector);
        const show = !forceHide && shown < visibleCount;
        if (show) {
          shown += 1;
        }
        el.setAttribute(REC_ATTR, '1');
        el.classList.toggle('tf-visible', show);
        el.classList.toggle('tf-hidden', !show);
        marked.push(el);
      }
    }

    setFlag('tf-watch-ready', true);
    void reason;
  }

  return {
    apply,
    destroy(): void {
      disconnectObserver();
      clearRootRetry();
      if (applyTimer) {
        clearTimeout(applyTimer);
      }
      clearDecorations();
    },
  };
}
