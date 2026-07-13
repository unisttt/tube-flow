/**
 * 右下ミニ UI。ホーム表示中のみ現れ、次へ/後で見る/興味なしを操作できる。
 */
import type { HomeSnapshot } from './home';

export interface ControlsActions {
  next(): void;
  getSnapshot(): HomeSnapshot;
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
      <span class="tf-meta" data-role="skip-remaining" aria-hidden="true"></span>
    </button>
  `;

  const skipNode = container.querySelector<HTMLElement>('[data-role="skip-remaining"]');
  const nextButton = container.querySelector<HTMLButtonElement>('button[data-action="next"]')!;

  function onClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLButtonElement>('button[data-action="next"]');
    if (!button) {
      return;
    }
    const snapshot = actions.getSnapshot();
    // 無効・スキップ上限到達時は「次へ」を受け付けない
    if (!snapshot.enabled || snapshot.atSkipLimit) {
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
    container.classList.toggle('tf-exit-requested', snapshot.exitRequested);

    // スキップ上限に達したら「次へ」を無効化して押せなくする
    nextButton.disabled = snapshot.atSkipLimit;

    if (!skipNode) {
      return;
    }
    if (!snapshot.enabled || !snapshot.threshold) {
      skipNode.textContent = '';
      skipNode.style.display = 'none';
      return;
    }
    const remaining = Math.max(0, snapshot.remainingSkips ?? snapshot.threshold);
    skipNode.textContent = `残り${remaining}`;
    skipNode.style.display = 'inline';
    skipNode.dataset.state = remaining === 0 ? 'zero' : 'positive';
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
