import {
  notifyContentScripts,
  readSettings,
  resetSettings,
  updateSettings
} from '../shared/settings.js';

const form = document.getElementById('popup-form');
const status = document.getElementById('status');
const stepButtons = Array.from(document.querySelectorAll('.step'));
const openOptionsButton = document.getElementById('open-options');
const restoreDefaultsButton = document.getElementById('restore-defaults');

const FIELD_LIMITS = {
  visibleCount: { min: 0, max: 6 },
  watchVisibleCount: { min: 0, max: 20 },
  skipCloseThreshold: { min: 0, max: 10 }
};

function showStatus(message, isError = false) {
  if (!message) {
    status.textContent = '';
    status.removeAttribute('data-error');
    return;
  }
  status.textContent = message;
  status.setAttribute('data-error', String(isError));
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = '';
      status.removeAttribute('data-error');
    }
  }, 2000);
}

function applySettingsToForm(settings) {
  form.enabled.checked = Boolean(settings.enabled);
  form.hideShorts.checked = Boolean(settings.hideShorts);
  form.visibleCount.value = String(settings.visibleCount);
  form.watchVisibleCount.value = String(settings.watchVisibleCount);
  form.skipCloseThreshold.value = String(settings.skipCloseThreshold);
  updateStepperDisabled();
}

function updateStepperDisabled() {
  stepButtons.forEach((button) => {
    const target = button.dataset.target;
    const step = Number(button.dataset.step || 0);
    const limits = FIELD_LIMITS[target];
    const input = form[target];
    if (!limits || !input) {
      button.disabled = true;
      return;
    }
    const currentValue = Number.parseInt(input.value, 10);
    if (!Number.isFinite(currentValue)) {
      button.disabled = false;
      return;
    }
    const nextValue = currentValue + step;
    button.disabled = nextValue < limits.min || nextValue > limits.max;
  });
}

async function persistField(name, rawValue) {
  try {
    const result = await updateSettings({ [name]: rawValue });
    applySettingsToForm(result);
    notifyContentScripts();
    showStatus('保存しました');
  } catch (error) {
    console.warn('[TubeFlow][popup] failed to persist field', name, error);
    showStatus('保存に失敗しました', true);
  }
}

function handleFieldChange(event) {
  const { name, type, value, checked } = event.target;
  if (!(name in FIELD_LIMITS) && name !== 'hideShorts' && name !== 'enabled') {
    return;
  }
  const rawValue = type === 'checkbox' ? checked : value;
  persistField(name, rawValue);
}

function handleInput(event) {
  const { name } = event.target;
  if (!(name in FIELD_LIMITS)) {
    return;
  }
  updateStepperDisabled();
}

function handleStepClick(event) {
  const button = event.currentTarget;
  const targetName = button.dataset.target;
  const step = Number(button.dataset.step || 0);
  const limits = FIELD_LIMITS[targetName];
  const input = form[targetName];
  if (!input || !limits) {
    return;
  }
  const current = Number.parseInt(input.value, 10) || 0;
  const next = Math.min(limits.max, Math.max(limits.min, current + step));
  input.value = String(next);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function handleRestoreDefaults() {
  try {
    const settings = await resetSettings();
    applySettingsToForm(settings);
    notifyContentScripts();
    showStatus('既定値を適用しました');
  } catch (error) {
    console.warn('[TubeFlow][popup] failed to reset settings', error);
    showStatus('既定値の適用に失敗しました', true);
  }
}

function handleOpenOptions() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/index.html') });
  }
  window.close();
}

async function init() {
  try {
    const settings = await readSettings();
    applySettingsToForm(settings);
  } catch (error) {
    console.warn('[TubeFlow][popup] failed to load settings', error);
    showStatus('設定の読み込みに失敗しました', true);
  }

  form.addEventListener('change', handleFieldChange);
  form.addEventListener('input', handleInput);
  stepButtons.forEach((button) => button.addEventListener('click', handleStepClick));
  restoreDefaultsButton.addEventListener('click', handleRestoreDefaults);
  openOptionsButton.addEventListener('click', handleOpenOptions);
}

document.addEventListener('DOMContentLoaded', init, { once: true });
