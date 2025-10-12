export const DEFAULTS = {
  enabled: true,
  visibleCount: 1,
  hideShorts: true,
  skipCloseThreshold: 3,
  watchVisibleCount: 0
};

export function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(numericValue)));
}

export function sanitizeSettings(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULTS };
  }

  return {
    enabled: Boolean(raw.enabled ?? DEFAULTS.enabled),
    visibleCount: clampNumber(raw.visibleCount, 0, 6, DEFAULTS.visibleCount),
    watchVisibleCount: clampNumber(raw.watchVisibleCount, 0, 20, DEFAULTS.watchVisibleCount),
    hideShorts: Boolean(raw.hideShorts ?? DEFAULTS.hideShorts),
    skipCloseThreshold: clampNumber(raw.skipCloseThreshold, 0, 10, DEFAULTS.skipCloseThreshold)
  };
}

export function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.warn('[TubeFlow][settings] read failed, fallback to defaults', error);
        resolve({ ...DEFAULTS });
        return;
      }
      resolve(sanitizeSettings({ ...DEFAULTS, ...(items || {}) }));
    });
  });
}

export function writeSettings(rawSettings) {
  const settings = sanitizeSettings(rawSettings);
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(settings, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(settings);
    });
  });
}

export async function updateSettings(partialSettings) {
  const current = await readSettings();
  return writeSettings({ ...current, ...(partialSettings || {}) });
}

export function resetSettings() {
  return writeSettings({ ...DEFAULTS });
}

export function notifyContentScripts() {
  const message = { source: 'tube-flow', type: 'options-updated' };

  try {
    chrome.runtime.sendMessage(message, () => {
      const err = chrome.runtime.lastError;
      if (err && !/Receiving end does not exist/i.test(err.message)) {
        console.warn('[TubeFlow][settings] runtime notify failed', err);
      }
    });
  } catch (error) {
    console.warn('[TubeFlow][settings] runtime notify threw', error);
  }

  if (!chrome.tabs || !chrome.tabs.query) {
    return;
  }

  chrome.tabs.query({ url: '*://www.youtube.com/*' }, (tabs) => {
    const queryError = chrome.runtime.lastError;
    if (queryError) {
      console.warn('[TubeFlow][settings] tabs query failed', queryError);
      return;
    }

    tabs.forEach((tab) => {
      try {
        chrome.tabs.sendMessage(tab.id, message, () => {
          const sendErr = chrome.runtime.lastError;
          if (sendErr && !/Receiving end does not exist/i.test(sendErr.message)) {
            console.warn('[TubeFlow][settings] tab notify failed', sendErr);
          }
        });
      } catch (error) {
        console.warn('[TubeFlow][settings] tab notify threw', error);
      }
    });
  });
}
