import {
  readSettings,
  resetSettings,
  writeSettings,
  type Settings,
} from '../../lib/settings';
import { notifyContentScripts } from '../../lib/messaging';

const form = document.getElementById('options-form') as HTMLFormElement;
const status = document.getElementById('status') as HTMLElement;
const summary = document.getElementById('summary') as HTMLElement;

function field<T extends HTMLElement = HTMLInputElement>(name: string): T {
  return form.elements.namedItem(name) as T;
}

function renderSummary(settings: Settings): void {
  const entries: Array<[string, string | number]> = [
    ['機能', settings.enabled ? '有効' : '無効'],
    ['表示カード数', settings.visibleCount],
    ['おすすめ表示数', settings.watchVisibleCount],
    ['Shorts 非表示', settings.hideShorts ? '有効' : '無効'],
    ['連続スキップ回数', settings.skipCloseThreshold],
  ];
  summary.innerHTML = entries
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join('');
}

function applySettingsToForm(settings: Settings): void {
  field<HTMLInputElement>('enabled').checked = settings.enabled;
  field<HTMLInputElement>('visibleCount').value = String(settings.visibleCount);
  field<HTMLInputElement>('watchVisibleCount').value = String(settings.watchVisibleCount);
  field<HTMLInputElement>('hideShorts').checked = settings.hideShorts;
  field<HTMLInputElement>('skipCloseThreshold').value = String(settings.skipCloseThreshold);
  renderSummary(settings);
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
  }, 2500);
}

async function loadSettings(): Promise<void> {
  try {
    applySettingsToForm(await readSettings());
  } catch (error) {
    console.warn('[TubeFlow][options] failed to load', error);
    showStatus('設定の読み込みに失敗しました', true);
  }
}

async function handleSave(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const raw: Partial<Settings> = {
    enabled: field<HTMLInputElement>('enabled').checked,
    visibleCount: Number(field<HTMLInputElement>('visibleCount').value),
    watchVisibleCount: Number(field<HTMLInputElement>('watchVisibleCount').value),
    hideShorts: field<HTMLInputElement>('hideShorts').checked,
    skipCloseThreshold: Number(field<HTMLInputElement>('skipCloseThreshold').value),
  };
  try {
    const settings = await writeSettings(raw);
    applySettingsToForm(settings);
    showStatus('保存しました');
    notifyContentScripts();
  } catch (error) {
    console.warn('[TubeFlow][options] failed to save', error);
    const message = error instanceof Error ? `: ${error.message}` : '';
    showStatus(`保存に失敗しました${message}`, true);
  }
}

async function handleRestoreDefaults(): Promise<void> {
  try {
    const settings = await resetSettings();
    applySettingsToForm(settings);
    showStatus('既定値を適用しました');
    notifyContentScripts();
  } catch (error) {
    console.warn('[TubeFlow][options] failed to reset', error);
    showStatus('既定値の適用に失敗しました', true);
  }
}

function init(): void {
  const restore = document.getElementById('restore-defaults') as HTMLButtonElement;
  restore.addEventListener('click', () => void handleRestoreDefaults());
  form.addEventListener('submit', (event) => void handleSave(event as SubmitEvent));
  void loadSettings();
}

init();
