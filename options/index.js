const DEFAULTS = {
  visibleCount: 1,
  hideShorts: true,
  skipCloseThreshold: 3,
  watchVisibleCount: 0
};

const form = document.getElementById('options-form');
const status = document.getElementById('status');
const summary = document.getElementById('summary');

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function renderSummary(settings) {
  const entries = [
    ['表示カード数', settings.visibleCount],
    ['おすすめ表示数', settings.watchVisibleCount],
    ['Shorts 非表示', settings.hideShorts ? '有効' : '無効'],
    ['連続スキップ回数', settings.skipCloseThreshold]
  ];
  summary.innerHTML = entries
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join('');
}

function loadSettings() {
  chrome.storage.sync.get(DEFAULTS, (items) => {
    const settings = { ...DEFAULTS, ...(items || {}) };
    form.visibleCount.value = Number(settings.visibleCount) || 0;
    form.watchVisibleCount.value = Number(settings.watchVisibleCount) || 0;
    form.hideShorts.checked = Boolean(settings.hideShorts);
    form.skipCloseThreshold.value = Number(settings.skipCloseThreshold) || 0;
    renderSummary(settings);
  });
}

function notifyContentScripts() {
  const message = { source: 'tube-flow', type: 'options-updated' };

  try {
    chrome.runtime.sendMessage(message, () => {
      const err = chrome.runtime.lastError;
      if (err && !/Receiving end does not exist/i.test(err.message)) {
        console.warn('[TubeFlow][options] runtime notify failed', err);
      }
    });
  } catch (error) {
    console.warn('[TubeFlow][options] runtime notify threw', error);
  }

  if (!chrome.tabs || !chrome.tabs.query) {
    return;
  }

  chrome.tabs.query({ url: '*://www.youtube.com/*' }, (tabs) => {
    const queryError = chrome.runtime.lastError;
    if (queryError) {
      console.warn('[TubeFlow][options] tabs query failed', queryError);
      return;
    }
    tabs.forEach((tab) => {
      try {
        chrome.tabs.sendMessage(tab.id, message, () => {
          const sendErr = chrome.runtime.lastError;
          if (sendErr && !/Receiving end does not exist/i.test(sendErr.message)) {
            console.warn('[TubeFlow][options] tab notify failed', sendErr);
          }
        });
      } catch (error) {
        console.warn('[TubeFlow][options] tab notify threw', error);
      }
    });
  });
}

function saveSettings(event) {
  event.preventDefault();
  const settings = {
    visibleCount: clampNumber(form.visibleCount.value, 0, 6, DEFAULTS.visibleCount),
    watchVisibleCount: clampNumber(form.watchVisibleCount.value, 0, 20, DEFAULTS.watchVisibleCount),
    hideShorts: Boolean(form.hideShorts.checked),
    skipCloseThreshold: clampNumber(form.skipCloseThreshold.value, 0, 10, DEFAULTS.skipCloseThreshold)
  };

  chrome.storage.sync.set(settings, () => {
    const message = chrome.runtime.lastError
      ? `保存に失敗しました: ${chrome.runtime.lastError.message}`
      : '保存しました';
    status.textContent = message;
    renderSummary(settings);
    notifyContentScripts();
    window.setTimeout(() => {
      status.textContent = '';
    }, 2500);
  });
}

function restoreDefaults() {
  chrome.storage.sync.set(DEFAULTS, () => {
    loadSettings();
    status.textContent = '既定値を適用しました';
    notifyContentScripts();
    window.setTimeout(() => {
      status.textContent = '';
    }, 2500);
  });
}

function init() {
  document.getElementById('restore-defaults').addEventListener('click', restoreDefaults);
  form.addEventListener('submit', saveSettings);
  loadSettings();
}

document.addEventListener('DOMContentLoaded', init, { once: true });
