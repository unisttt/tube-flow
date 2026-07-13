import {
  LIMITS,
  readSettings,
  resetSettings,
  updateSettings,
  type Settings,
} from '../../lib/settings';
import { notifyContentScripts } from '../../lib/messaging';

const form = document.getElementById('popup-form') as HTMLFormElement;
const status = document.getElementById('status') as HTMLElement;
const stepButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.step'));
const openOptionsButton = document.getElementById('open-options') as HTMLButtonElement;
const restoreDefaultsButton = document.getElementById('restore-defaults') as HTMLButtonElement;

type NumericField = keyof typeof LIMITS;
const NUMERIC_FIELDS = Object.keys(LIMITS) as NumericField[];
const BOOLEAN_FIELDS = ['enabled', 'hideShorts'] as const;

function field<T extends HTMLElement = HTMLInputElement>(name: string): T {
  return form.elements.namedItem(name) as T;
}

function showStatus(message: string, isError = false): void {
  status.textContent = message;
  if (isError) {
    status.dataset.error = 'true';
  } else {
    delete status.dataset.error;
  }
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = '';
      delete status.dataset.error;
    }
  }, 2000);
}

function applySettingsToForm(settings: Settings): void {
  field<HTMLInputElement>('enabled').checked = settings.enabled;
  field<HTMLInputElement>('hideShorts').checked = settings.hideShorts;
  field<HTMLInputElement>('visibleCount').value = String(settings.visibleCount);
  field<HTMLInputElement>('watchVisibleCount').value = String(settings.watchVisibleCount);
  field<HTMLInputElement>('skipCloseThreshold').value = String(settings.skipCloseThreshold);
  updateStepperDisabled();
}

function updateStepperDisabled(): void {
  for (const button of stepButtons) {
    const target = button.dataset.target as NumericField | undefined;
    const step = Number(button.dataset.step ?? 0);
    const limits = target ? LIMITS[target] : undefined;
    const input = target ? field<HTMLInputElement>(target) : null;
    if (!limits || !input) {
      button.disabled = true;
      continue;
    }
    const current = Number.parseInt(input.value, 10);
    if (!Number.isFinite(current)) {
      button.disabled = false;
      continue;
    }
    const next = current + step;
    button.disabled = next < limits.min || next > limits.max;
  }
}

async function persistField(name: keyof Settings, rawValue: string | boolean): Promise<void> {
  try {
    const result = await updateSettings({ [name]: rawValue } as Partial<Settings>);
    applySettingsToForm(result);
    notifyContentScripts();
    showStatus('保存しました');
  } catch (error) {
    console.warn('[TubeFlow][popup] failed to persist', name, error);
    showStatus('保存に失敗しました', true);
  }
}

function isBooleanField(name: string): name is (typeof BOOLEAN_FIELDS)[number] {
  return (BOOLEAN_FIELDS as readonly string[]).includes(name);
}
function isNumericField(name: string): name is NumericField {
  return (NUMERIC_FIELDS as readonly string[]).includes(name);
}

function handleChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const { name, type, value, checked } = target;
  if (!isNumericField(name) && !isBooleanField(name)) {
    return;
  }
  void persistField(name as keyof Settings, type === 'checkbox' ? checked : value);
}

function handleInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (isNumericField(target.name)) {
    updateStepperDisabled();
  }
}

function handleStepClick(event: Event): void {
  const button = event.currentTarget as HTMLButtonElement;
  const target = button.dataset.target as NumericField | undefined;
  const step = Number(button.dataset.step ?? 0);
  const limits = target ? LIMITS[target] : undefined;
  const input = target ? field<HTMLInputElement>(target) : null;
  if (!input || !limits) {
    return;
  }
  const current = Number.parseInt(input.value, 10) || 0;
  const next = Math.min(limits.max, Math.max(limits.min, current + step));
  input.value = String(next);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function handleRestoreDefaults(): Promise<void> {
  try {
    const settings = await resetSettings();
    applySettingsToForm(settings);
    notifyContentScripts();
    showStatus('既定値を適用しました');
  } catch (error) {
    console.warn('[TubeFlow][popup] failed to reset', error);
    showStatus('既定値の適用に失敗しました', true);
  }
}

function handleOpenOptions(): void {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('/options.html') });
  }
  window.close();
}

async function init(): Promise<void> {
  try {
    applySettingsToForm(await readSettings());
  } catch (error) {
    console.warn('[TubeFlow][popup] failed to load', error);
    showStatus('設定の読み込みに失敗しました', true);
  }
  form.addEventListener('change', handleChange);
  form.addEventListener('input', handleInput);
  stepButtons.forEach((button) => button.addEventListener('click', handleStepClick));
  restoreDefaultsButton.addEventListener('click', () => void handleRestoreDefaults());
  openOptionsButton.addEventListener('click', handleOpenOptions);
}

void init();
