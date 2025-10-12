(() => {
  const NAMESPACE = '[TubeFlow][UI]';
  const CLASSNAME = 'hd-controls';
  let container = null;
  let skipRemainingNode = null;

  function log(...args) {
    console.debug(NAMESPACE, ...args);
  }

  function getCore() {
    return window.TubeFlow && window.TubeFlow.core;
  }

  function handleButtonClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }
    const action = button.dataset.action;
    const core = getCore();
    if (!core) {
      return;
    }
    const snapshot = core.getState ? core.getState() : null;
    if (!snapshot || !snapshot.settings?.enabled) {
      return;
    }
    if (action === 'next') {
      core.advanceCursor?.(1);
    } else if (action === 'watch-later') {
      const ok = core.addCurrentToWatchLater?.();
      if (!ok) {
        button.setAttribute('data-error', 'true');
        setTimeout(() => button.removeAttribute('data-error'), 1500);
      }
    } else if (action === 'not-interested') {
      const ok = core.markCurrentAsNotInterested?.();
      if (!ok) {
        button.setAttribute('data-error', 'true');
        setTimeout(() => button.removeAttribute('data-error'), 1500);
      }
    }
  }

  function updateVisibility() {
    if (!container) {
      return;
    }
    const core = getCore();
    const snapshot = core && core.getState ? core.getState() : null;
    const enabled = Boolean(snapshot?.settings?.enabled);
    const isHome = Boolean(snapshot?.isHome);
    container.style.display = enabled && isHome ? 'flex' : 'none';
    container.classList.toggle('hd-disabled', !enabled);
  }

  function mount() {
    if (container || !document.body) {
      return;
    }
    container = document.createElement('div');
    container.className = CLASSNAME;
    container.innerHTML = `
      <button type="button" data-action="next" aria-label="次の動画" title="次の動画 (Alt+J)">
        <span class="hd-label">次へ</span>
        <span class="hd-meta" data-role="skip-remaining" aria-hidden="true"></span>
      </button>
      <button type="button" data-action="watch-later" aria-label="後で見るに追加" title="後で見るに追加 (Alt+L)">後で見る</button>
      <button type="button" data-action="not-interested" aria-label="興味なしにする" title="興味なしにする">興味なし</button>
    `;
    container.addEventListener('click', handleButtonClick);
    skipRemainingNode = container.querySelector('[data-role="skip-remaining"]');
    document.body.appendChild(container);
    updateVisibility();
    updateState();
    log('mounted');
  }

  function updateState() {
    if (!container) {
      return;
    }
    const core = getCore();
    if (!core) {
      return;
    }
    const snapshot = core.getState ? core.getState() : null;
    if (!snapshot || !skipRemainingNode) {
      return;
    }

    const enabled = Boolean(snapshot.settings?.enabled);
    if (!enabled) {
      skipRemainingNode.textContent = '';
      skipRemainingNode.style.display = 'none';
      container.classList.remove('hd-exit-requested');
      return;
    }

    const { threshold, remainingSkips, exitRequested } = snapshot;
    if (!threshold) {
      skipRemainingNode.textContent = '';
      skipRemainingNode.style.display = 'none';
    } else {
      const remaining = Math.max(0, remainingSkips ?? threshold);
      skipRemainingNode.textContent = `残り${remaining}`;
      skipRemainingNode.style.display = 'inline';
      skipRemainingNode.dataset.state = remaining === 0 ? 'zero' : 'positive';
    }

    container.classList.toggle('hd-exit-requested', Boolean(exitRequested));
  }

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    mount();
  }

  window.addEventListener('tube-flow:core-ready', () => {
    init();
    updateVisibility();
    updateState();
  });

  document.addEventListener('yt-navigate-finish', () => {
    updateVisibility();
    updateState();
  });

  window.addEventListener('popstate', () => updateVisibility());
  window.addEventListener('tube-flow:state', (event) => {
    if (!event || !event.detail) {
      return;
    }
    updateVisibility();
    updateState();
  });

  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
