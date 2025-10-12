import { notifyContentScripts, readSettings, resetSettings, writeSettings } from '../shared/settings.js';

const form = document.getElementById('options-form');
const status = document.getElementById('status');
const summary = document.getElementById('summary');

function renderSummary(settings) {
  const entries = [
    ['機能', settings.enabled ? '有効' : '無効'],
    ['表示カード数', settings.visibleCount],
    ['おすすめ表示数', settings.watchVisibleCount],
    ['Shorts 非表示', settings.hideShorts ? '有効' : '無効'],
    ['連続スキップ回数', settings.skipCloseThreshold]
  ];
  summary.innerHTML = entries
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join('');
}

function applySettingsToForm(settings) {
  form.enabled.checked = Boolean(settings.enabled);
  form.visibleCount.value = String(settings.visibleCount);
  form.watchVisibleCount.value = String(settings.watchVisibleCount);
  form.hideShorts.checked = settings.hideShorts;
  form.skipCloseThreshold.value = String(settings.skipCloseThreshold);
  renderSummary(settings);
}

function showStatus(message, isError = false) {
  if (!message) {
    status.textContent = '';
    delete status.dataset.error;
    return;
  }
  status.textContent = message;
  status.dataset.error = String(isError);
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = '';
      delete status.dataset.error;
    }
  }, 2500);
}

async function loadSettings() {
  try {
    const settings = await readSettings();
    applySettingsToForm(settings);
  } catch (error) {
    console.warn('[TubeFlow][options] failed to load settings', error);
    showStatus('設定の読み込みに失敗しました', true);
  }
}

async function handleSave(event) {
  event.preventDefault();
  const rawSettings = {
    enabled: form.enabled.checked,
    visibleCount: form.visibleCount.value,
    watchVisibleCount: form.watchVisibleCount.value,
    hideShorts: form.hideShorts.checked,
    skipCloseThreshold: form.skipCloseThreshold.value
  };

  try {
    const settings = await writeSettings(rawSettings);
    applySettingsToForm(settings);
    showStatus('保存しました');
    notifyContentScripts();
  } catch (error) {
    console.warn('[TubeFlow][options] failed to save settings', error);
    showStatus(
      `保存に失敗しました${error?.message ? `: ${error.message}` : ''}`,
      true
    );
  }
}

async function handleRestoreDefaults() {
  try {
    const settings = await resetSettings();
    applySettingsToForm(settings);
    showStatus('既定値を適用しました');
    notifyContentScripts();
  } catch (error) {
    console.warn('[TubeFlow][options] failed to reset settings', error);
    showStatus('既定値の適用に失敗しました', true);
  }
}

function init() {
  document.getElementById('restore-defaults').addEventListener('click', handleRestoreDefaults);
  form.addEventListener('submit', handleSave);
  loadSettings();
}

document.addEventListener('DOMContentLoaded', init, { once: true });
