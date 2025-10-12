(() => {
  const NAMESPACE = '[TubeFlow][watch]';
  const CLASS_TARGET = 'hd-watch-target';
  const DEFAULTS = {
    enabled: true,
    watchVisibleCount: 0
  };
  const TILE_SELECTOR = [
    'yt-lockup-view-model',
    'ytd-compact-video-renderer',
    'ytd-compact-radio-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-compact-movie-renderer',
    'ytd-compact-channel-renderer',
    'ytd-compact-autoplay-renderer',
    'ytd-compact-station-renderer',
    'ytd-compact-show-renderer',
    'ytd-compact-mix-renderer',
    'ytd-reel-shelf-renderer',
    'yt-horizontal-list-renderer'
  ].join(', ');

  const COUNTABLE_SELECTOR = [
    'yt-lockup-view-model',
    'ytd-compact-video-renderer',
    'ytd-compact-radio-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-compact-movie-renderer',
    'ytd-compact-channel-renderer',
    'ytd-compact-autoplay-renderer',
    'ytd-compact-station-renderer',
    'ytd-compact-show-renderer',
    'ytd-compact-mix-renderer'
  ].join(', ');

  const ALWAYS_HIDE_SELECTOR = [
    'ytd-reel-shelf-renderer',
    'yt-horizontal-list-renderer'
  ].join(', ');

  const state = {
    settings: { ...DEFAULTS },
    root: null,
    tiles: [],
    observer: null,
    applyTimer: null,
    rootRetryTimer: null
  };

  function log(...args) {
    console.debug(NAMESPACE, ...args);
  }

  function setWatchReady(ready) {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.classList.toggle('hd-watch-ready', Boolean(ready));
  }

  function isWatchPage() {
    return /(^|\.)youtube\.com$/.test(location.hostname) && location.pathname.startsWith('/watch');
  }

  function setWatchActive(active) {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.classList.toggle(CLASS_TARGET, Boolean(active));
    if (!active) {
      setWatchReady(false);
    }
  }

  function loadSettings() {
    state.settings = { ...DEFAULTS };
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (items) => {
          if (chrome.runtime.lastError) {
            console.warn(`${NAMESPACE} storage get failed`, chrome.runtime.lastError);
            resolve(state.settings);
            return;
          }
          state.settings = { ...DEFAULTS, ...(items || {}) };
          log('settings loaded', state.settings);
          resolve(state.settings);
        });
      } catch (error) {
        console.error(`${NAMESPACE} storage exception`, error);
        resolve(state.settings);
      }
    });
  }

  function scheduleApply(reason) {
    if (state.applyTimer) {
      return;
    }
    state.applyTimer = setTimeout(() => {
      state.applyTimer = null;
      applyVisibility(reason);
    }, 120);
  }

  function requestRootRetry() {
    if (state.rootRetryTimer) {
      return;
    }
    state.rootRetryTimer = setTimeout(() => {
      state.rootRetryTimer = null;
      scheduleApply('root-retry');
    }, 400);
  }

  function ensureRoot() {
    if (!isWatchPage()) {
      disconnectObserver();
      state.root = null;
      return null;
    }
    const selectorCandidates = [
      'ytd-watch-flexy #related ytd-watch-next-secondary-results-renderer #items',
      'ytd-watch-flexy #related ytd-watch-next-secondary-results-renderer #contents',
      'ytd-watch-flexy #secondary ytd-watch-next-secondary-results-renderer #items',
      'ytd-watch-flexy #secondary ytd-watch-next-secondary-results-renderer #contents',
      'ytd-watch-flexy #related #items',
      'ytd-watch-flexy #secondary #contents',
      'ytd-watch-flexy #related',
      'ytd-watch-flexy #secondary'
    ];
    let nextRoot = null;
    for (const selector of selectorCandidates) {
      nextRoot = document.querySelector(selector);
      if (nextRoot) {
        break;
      }
    }
    if (!nextRoot) {
      return null;
    }
    if (state.root !== nextRoot) {
      state.root = nextRoot;
      reconnectObserver();
    }
    if (state.rootRetryTimer) {
      clearTimeout(state.rootRetryTimer);
      state.rootRetryTimer = null;
    }
    return state.root;
  }

  function reconnectObserver() {
    if (!state.observer) {
      state.observer = new MutationObserver(handleMutations);
    }
    if (!state.root) {
      disconnectObserver();
      return;
    }
    state.observer.disconnect();
    try {
      state.observer.observe(state.root, { childList: true, subtree: true });
    } catch (error) {
      console.warn(`${NAMESPACE} observer attach failed`, error);
    }
  }

  function disconnectObserver() {
    if (state.observer) {
      state.observer.disconnect();
    }
  }

  function handleMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
        scheduleApply('mutation');
        break;
      }
    }
  }

  function clearDecorations() {
    if (!state.tiles.length) {
      return;
    }
    state.tiles.forEach((tile) => {
      tile.classList.remove('hd-hidden', 'hd-visible');
    });
    state.tiles = [];
  }

  function applyVisibility(reason) {
    if (!isWatchPage()) {
      setWatchActive(false);
      clearDecorations();
      disconnectObserver();
      state.root = null;
      if (state.rootRetryTimer) {
        clearTimeout(state.rootRetryTimer);
        state.rootRetryTimer = null;
      }
      setWatchReady(false);
      return;
    }

    const root = ensureRoot();

    if (!state.settings.enabled) {
      setWatchActive(false);
      setWatchReady(false);
      clearDecorations();
      disconnectObserver();
      state.root = null;
      if (state.rootRetryTimer) {
        clearTimeout(state.rootRetryTimer);
        state.rootRetryTimer = null;
      }
      return;
    }

    setWatchActive(true);
    setWatchReady(false);
    if (!root) {
      requestRootRetry();
      return;
    }

    const childElements = root.matches(TILE_SELECTOR)
      ? [root]
      : Array.from(root.children || []);
    let tiles = childElements.filter((node) => {
      if (!(node instanceof Element)) {
        return false;
      }
      return node.matches(TILE_SELECTOR);
    });

    if (!tiles.length && typeof root.querySelectorAll === 'function') {
      tiles = Array.from(root.querySelectorAll(TILE_SELECTOR));
    }

    state.tiles = tiles;
    const visibleCount = Math.max(0, Number(state.settings.watchVisibleCount) || 0);
    let shown = 0;

    tiles.forEach((tile) => {
      const forceHide = tile.matches(ALWAYS_HIDE_SELECTOR);
      const isCountable = tile.matches(COUNTABLE_SELECTOR);

      let shouldShow = false;
      if (!forceHide && isCountable && visibleCount > 0 && shown < visibleCount) {
        shouldShow = true;
        shown += 1;
      }

      tile.classList.toggle('hd-visible', shouldShow);
      tile.classList.toggle('hd-hidden', !shouldShow);
    });

    setWatchReady(true);
    log('applied', { reason, visibleCount, totalTiles: tiles.length, shown });
  }

  function handleStorageChanged(changes, area) {
    if (area !== 'sync') {
      return;
    }
    let updated = false;
    if (Object.prototype.hasOwnProperty.call(changes, 'watchVisibleCount')) {
      state.settings.watchVisibleCount = changes.watchVisibleCount.newValue ?? DEFAULTS.watchVisibleCount;
      updated = true;
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'enabled')) {
      state.settings.enabled = changes.enabled.newValue ?? DEFAULTS.enabled;
      updated = true;
    }
    if (updated) {
      scheduleApply('settings-change');
    }
  }

  function handleNavigation() {
    clearDecorations();
    setWatchActive(isWatchPage() && state.settings.enabled);
    setWatchReady(false);
    scheduleApply('navigate');
  }

  function handleRuntimeMessage(message, sender, sendResponse) {
    if (!message || message.source !== 'tube-flow') {
      return;
    }
    if (message.type === 'options-updated') {
      loadSettings().then(() => {
        scheduleApply('options-update');
      });
      if (typeof sendResponse === 'function') {
        sendResponse({ ok: true });
      }
      return true;
    }
  }

  async function init() {
    await loadSettings();
    setWatchActive(isWatchPage() && state.settings.enabled);
    setWatchReady(false);
    scheduleApply('init');

    chrome.storage.onChanged.addListener(handleStorageChanged);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    document.addEventListener('yt-navigate-finish', () => {
      handleNavigation();
    });
    window.addEventListener('popstate', () => scheduleApply('popstate'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
