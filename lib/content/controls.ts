/**
 * 右下ミニ UI。ホーム表示中のみ現れ、「次へ」を押せる。
 * 回数制限は無く、押した回数（本日）をバッジで可視化する。
 */
import type { HomeSnapshot } from './home';

export interface ControlsActions {
  next(): void;
  getSnapshot(): HomeSnapshot;
  /** 本日の「次へ」押下回数 */
  getSkips(): number;
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
    const skips = actions.getSkips();
    if (skips > 0) {
      countNode.textContent = `本日${skips}回`;
      countNode.style.display = 'inline';
      // 回数が増えるほど目立たせる（注意喚起）
      countNode.dataset.level = skips >= 20 ? 'high' : skips >= 10 ? 'mid' : 'low';
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
