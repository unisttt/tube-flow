(() => {
  const NAMESPACE = '[TubeFlow]';
  const DEFAULT_SETTINGS = {
    visibleCount: 1,
    hideShorts: true,
    skipCloseThreshold: 3
  };

  window.TubeFlow = window.TubeFlow || {};
  const homeAdapter = window.TubeFlow.adapters && window.TubeFlow.adapters.home;
  const coreUtils = (typeof window.TubeFlowCoreUtils !== 'undefined') ? window.TubeFlowCoreUtils : null;

  if (!homeAdapter || !coreUtils) {
    console.warn(`${NAMESPACE} required adapter or utils are not available`);
    return;
  }

  const state = {
    cursorIndex: 0,
    skipCount: 0,
    settings: { ...DEFAULT_SETTINGS },
    tiles: [],
    root: null,
    observer: null,
    applyTimer: null,
    rootRetryTimer: null,
    exitRequested: false
  };

  function computeStateSnapshot() {
    const threshold = Math.max(0, Number(state.settings.skipCloseThreshold) || 0);
    const remainingSkips = threshold ? Math.max(0, threshold - state.skipCount) : null;
    return {
      cursorIndex: state.cursorIndex,
      skipCount: state.skipCount,
      settings: { ...state.settings },
      isHome: isHomePage(),
      threshold,
      remainingSkips,
      exitRequested: state.exitRequested
    };
  }

  function emitStateUpdate(reason) {
    const detail = computeStateSnapshot();
    detail.reason = reason;
    window.dispatchEvent(new CustomEvent('tube-flow:state', { detail }));
  }

  function log(...args) {
    console.debug(NAMESPACE, ...args);
  }

  function setHomeActive(active) {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.classList.toggle('hd-home-target', Boolean(active));
    log('setHomeActive', { active });
  }

  function setReadyState(ready) {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.classList.toggle('hd-ready', Boolean(ready));
    log('setReadyState', { ready });
    emitStateUpdate('ready-change');
  }

  function syncRootFlags() {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.classList.toggle('hd-hide-shorts', Boolean(state.settings.hideShorts));
  }

  function isHomePage() {
    return /(^|\.)youtube\.com$/.test(location.hostname) && location.pathname === '/';
  }

  function loadSettings() {
    state.settings = { ...DEFAULT_SETTINGS };
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
          if (chrome.runtime.lastError) {
            console.warn(`${NAMESPACE} storage get failed`, chrome.runtime.lastError);
            resolve(state.settings);
            return;
          }
          state.settings = { ...DEFAULT_SETTINGS, ...(items || {}) };
          log('settings loaded', state.settings);
          syncRootFlags();
          resolve(state.settings);
        });
      } catch (error) {
        console.error(`${NAMESPACE} storage exception`, error);
        resolve(state.settings);
      }
    });
  }

  function effectiveVisibleCount() {
    return coreUtils.computeEffectiveVisibleCount(state.settings, 0, Date.now());
  }

  function scheduleApply(reason) {
    if (state.applyTimer) {
      return;
    }
    state.applyTimer = setTimeout(() => {
      state.applyTimer = null;
      applyVisibility(reason);
    }, 160);
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
    if (!isHomePage()) {
      disconnectObserver();
      state.root = null;
      return null;
    }

    const selector = homeAdapter.selectors && homeAdapter.selectors.root;
    if (!selector) {
      return null;
    }
    const nextRoot = document.querySelector(selector);
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

  function toggleShorts(hide) {
    const selectors = (homeAdapter.selectors && homeAdapter.selectors.shortsShelves) || [];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.classList.toggle('hd-hidden', hide);
      });
    });
  }

  function clearDecorations() {
    if (state.tiles.length) {
      state.tiles.forEach((tile) => tile.classList.remove('hd-hidden'));
    }
    state.tiles = [];
    toggleShorts(false);
  }

  function applyVisibility(reason) {
    if (!isHomePage()) {
      setHomeActive(false);
      setReadyState(false);
      clearDecorations();
      return;
    }
    setHomeActive(true);
    const root = ensureRoot();
    if (!root) {
      setReadyState(false);
      requestRootRetry();
      return;
    }

    const tileSelector = homeAdapter.selectors && homeAdapter.selectors.tile;
    if (!tileSelector) {
      return;
    }
    const tiles = Array.from(root.querySelectorAll(tileSelector));
    state.tiles = tiles;
    const visibleCount = effectiveVisibleCount();
    const cursor = coreUtils.clampCursor(state.cursorIndex, tiles.length, visibleCount);
    state.cursorIndex = cursor;

    const bounds = coreUtils.computeVisibleBounds(cursor, visibleCount);

    tiles.forEach((tile, index) => {
      const shouldShow = visibleCount > 0 && index >= bounds.start && index < bounds.end;
      tile.classList.toggle('hd-visible', shouldShow);
      tile.classList.toggle('hd-hidden', !shouldShow);
    });

    toggleShorts(Boolean(state.settings.hideShorts));
    setReadyState(true);
    log('applied', { reason, visibleCount, cursor, totalTiles: tiles.length });
    emitStateUpdate('apply');
  }

  function advanceCursor(step = 1) {
    if (!Number.isFinite(step) || step === 0) {
      return;
    }
    state.cursorIndex += step;
    if (step > 0) {
      state.skipCount += 1;
    } else {
      state.skipCount = Math.max(0, state.skipCount - 1);
    }
    scheduleApply('cursor-change');
    maybeRequestExit();
    emitStateUpdate('cursor-change');
  }

  function resetCursor() {
    state.cursorIndex = 0;
    state.skipCount = 0;
    state.exitRequested = false;
    scheduleApply('cursor-reset');
    emitStateUpdate('cursor-reset');
  }

  function getCurrentTile() {
    if (!state.tiles.length) {
      return null;
    }
    const index = coreUtils.clampCursor(state.cursorIndex, state.tiles.length, effectiveVisibleCount());
    return state.tiles[index] || null;
  }

  function addCurrentToWatchLater() {
    const tile = getCurrentTile();
    if (!tile) {
      return false;
    }
    const selectors = (homeAdapter.selectors && homeAdapter.selectors.watchLaterButtons) || [];
    for (const selector of selectors) {
      const button = tile.querySelector(selector);
      if (button) {
        button.click();
        return true;
      }
    }
    const fallback = tile.querySelector('button[aria-label*="Watch later" i], button[aria-label*="後で見る" i]');
    if (fallback) {
      fallback.click();
      return true;
    }
    return false;
  }

  function maybeRequestExit() {
    if (!coreUtils.shouldRequestExit(state.skipCount, state.settings.skipCloseThreshold)) {
      return;
    }
    if (state.exitRequested) {
      return;
    }
    state.exitRequested = true;
    try {
      chrome.runtime.sendMessage({ source: 'tube-flow', type: 'request-exit', reason: 'skip-threshold' }, () => {
      if (chrome.runtime.lastError) {
        console.warn(`${NAMESPACE} exit request failed`, chrome.runtime.lastError);
        state.exitRequested = false;
        emitStateUpdate('exit-request-failed');
      }
    });
  } catch (error) {
    console.error(`${NAMESPACE} exit request error`, error);
    state.exitRequested = false;
    emitStateUpdate('exit-request-error');
  }
  }

  function handleStorageChanged(changes, area) {
    if (area !== 'sync') {
      return;
    }
    let updated = false;
    Object.entries(changes).forEach(([key, value]) => {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
        state.settings[key] = value.newValue ?? DEFAULT_SETTINGS[key];
        updated = true;
      }
    });
    if (updated) {
      syncRootFlags();
      scheduleApply('settings-change');
      log('settings updated', state.settings);
      emitStateUpdate('settings-change');
    }
  }

  function handleNavigation() {
    setReadyState(false);
    resetCursor();
    emitStateUpdate('navigate');
  }

  function handleRuntimeMessage(message, sender, sendResponse) {
    if (!message || message.source !== 'tube-flow') {
      return;
    }
    if (message.type === 'command-next') {
      advanceCursor(1);
      if (typeof sendResponse === 'function') {
        sendResponse({ ok: true });
      }
      return;
    }
    if (message.type === 'command-watch-later') {
      const ok = addCurrentToWatchLater();
      if (typeof sendResponse === 'function') {
        sendResponse({ ok });
      }
      return;
    }
    if (message.type === 'options-updated') {
      loadSettings().then(() => {
        syncRootFlags();
        scheduleApply('options-update');
        emitStateUpdate('options-update');
      });
      if (typeof sendResponse === 'function') {
        sendResponse({ ok: true });
      }
      return true;
    }
  }

  async function init() {
    await loadSettings();
    setHomeActive(isHomePage());
    syncRootFlags();
    setReadyState(false);
    ensureRoot();
    scheduleApply('init');

    chrome.storage.onChanged.addListener(handleStorageChanged);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    document.addEventListener('yt-navigate-finish', () => {
      handleNavigation();
      scheduleApply('navigate');
    });
    window.addEventListener('popstate', () => scheduleApply('popstate'));

    reconnectObserver();

    window.TubeFlow.core = {
      advanceCursor,
      resetCursor,
      addCurrentToWatchLater,
      scheduleApply,
      getState: () => computeStateSnapshot(),
      isHomePage
    };

    window.dispatchEvent(new CustomEvent('tube-flow:core-ready', {
      detail: { version: '0.1.0' }
    }));
    emitStateUpdate('init');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
