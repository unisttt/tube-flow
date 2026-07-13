/**
 * 右下ミニ UI。ホーム表示中のみ現れ、「次へ」を押せる。
 * 回数制限は無く、押した回数＝依存度として累計をバッジで可視化する
 * （日別の推移グラフはポップアップ/オプションに表示）。
 */
import type { HomeSnapshot } from './home';

/** 「次へ」の回数（本日 / 累計） */
export interface SkipStats {
  today: number;
  total: number;
}

export interface ControlsActions {
  next(): void;
  getSnapshot(): HomeSnapshot;
  /** 「次へ」押下回数（本日ぶん・累計） */
  getSkipStats(): SkipStats;
}

export interface Controls {
  refresh(): void;
  destroy(): void;
}

export function mountControls(actions: ControlsActions): Controls {
  const container = document.createElement('div');
  container.className = 'tf-controls';
  container.innerHTML = `
    <button type="button" data-action="next" aria-label="次へ（表示枚数ぶん送る）" title="次へ (Alt+J)">
      <span>次へ</span>
      <span class="tf-meta" data-role="skip-count" aria-hidden="true"></span>
    </button>
  `;

  const countNode = container.querySelector<HTMLElement>('[data-role="skip-count"]');

  function onClick(event: MouseEvent): void {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action="next"]',
    );
    if (!button) {
      return;
    }
    if (!actions.getSnapshot().enabled) {
      return;
    }
    actions.next();
  }

  container.addEventListener('click', onClick);
  document.body.appendChild(container);

  function refresh(): void {
    const snapshot = actions.getSnapshot();
    const show = snapshot.enabled && snapshot.isHome;
    container.dataset.visible = show ? 'true' : 'false';

    if (!countNode) {
      return;
    }
    const { today, total } = actions.getSkipStats();
    if (total > 0) {
      // 累計＝依存度を常時表示。色は「今日の押しすぎ」を今日ぶんで警告する。
      countNode.textContent = `累計${total}回`;
      countNode.title = `累計${total}回・本日${today}回`;
      countNode.style.display = 'inline';
      countNode.dataset.level = today >= 20 ? 'high' : today >= 10 ? 'mid' : 'low';
    } else {
      countNode.textContent = '';
      countNode.style.display = 'none';
    }
  }

  refresh();

  return {
    refresh,
    destroy(): void {
      container.removeEventListener('click', onClick);
      container.remove();
    },
  };
}
