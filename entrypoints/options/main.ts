import {
  readSettings,
  resetSettings,
  writeSettings,
  sanitizeWindows,
  type Settings,
  type TimeWindow,
} from '../../lib/settings';
import { notifyContentScripts } from '../../lib/messaging';
import {
  USAGE_KEY,
  dayKey,
  normalizeRecord,
  formatMinutes,
  totalSkips,
  recentSkips,
  skipChartSvg,
} from '../../lib/usage';

const form = document.getElementById('options-form') as HTMLFormElement;
const status = document.getElementById('status') as HTMLElement;
const summary = document.getElementById('summary') as HTMLElement;
const windowsHost = document.getElementById('windows') as HTMLElement;
const addWindowButton = document.getElementById('add-window') as HTMLButtonElement;
const usageReadout = document.getElementById('usage-readout') as HTMLElement;
const usageChart = document.getElementById('usage-chart') as HTMLElement;

// 時間帯ブロックの編集状態（保存時にこの配列を書き出す）
let windows: TimeWindow[] = [];

function field<T extends HTMLElement = HTMLInputElement>(name: string): T {
  return form.elements.namedItem(name) as T;
}

function renderWindows(): void {
  windowsHost.innerHTML = '';
  windows.forEach((win, index) => {
    const row = document.createElement('div');
    row.className = 'window-row';
    row.innerHTML = `
      <input type="time" class="win-start" value="${win.start}" aria-label="開始時刻" />
      <span class="sep">〜</span>
      <input type="time" class="win-end" value="${win.end}" aria-label="終了時刻" />
      <button type="button" class="remove-window" aria-label="この時間帯を削除">削除</button>
    `;
    row.querySelector<HTMLInputElement>('.win-start')!.addEventListener('change', (e) => {
      windows[index] = { ...windows[index]!, start: (e.target as HTMLInputElement).value };
    });
    row.querySelector<HTMLInputElement>('.win-end')!.addEventListener('change', (e) => {
      windows[index] = { ...windows[index]!, end: (e.target as HTMLInputElement).value };
    });
    row.querySelector<HTMLButtonElement>('.remove-window')!.addEventListener('click', () => {
      windows.splice(index, 1);
      renderWindows();
    });
    windowsHost.appendChild(row);
  });
}

function renderSummary(settings: Settings): void {
  const schedule = settings.scheduleBlockEnabled
    ? settings.blockWindows.map((w) => `${w.start}〜${w.end}`).join(', ') || '（時間帯なし）'
    : '無効';
  const dailyLimit = settings.dailyLimitEnabled ? `${settings.dailyLimitMinutes}分/日` : '無効';
  const entries: Array<[string, string | number]> = [
    ['機能', settings.enabled ? '有効' : '無効'],
    ['表示カード数', settings.visibleCount],
    ['カードの幅', `${settings.cardWidth}px`],
    ['おすすめ表示数', settings.watchVisibleCount],
    ['Shorts 非表示', settings.hideShorts ? '有効' : '無効'],
    ['時間帯ブロック', schedule],
    ['1日の視聴上限', dailyLimit],
    ['再生時間フィルタ', settings.durationFilterEnabled
      ? `${settings.durationMinMinutes || 0}〜${settings.durationMaxMinutes || '∞'}分`
      : '無効'],
    ['スキップ済みを隠す', settings.hideSkippedEnabled ? '有効' : '無効'],
  ];
  summary.innerHTML = entries
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join('');
}

function applySettingsToForm(settings: Settings): void {
  field<HTMLInputElement>('enabled').checked = settings.enabled;
  field<HTMLInputElement>('visibleCount').value = String(settings.visibleCount);
  field<HTMLInputElement>('cardWidth').value = String(settings.cardWidth);
  field<HTMLInputElement>('watchVisibleCount').value = String(settings.watchVisibleCount);
  field<HTMLInputElement>('hideShorts').checked = settings.hideShorts;
  field<HTMLInputElement>('durationFilterEnabled').checked = settings.durationFilterEnabled;
  field<HTMLInputElement>('durationMinMinutes').value = String(settings.durationMinMinutes);
  field<HTMLInputElement>('durationMaxMinutes').value = String(settings.durationMaxMinutes);
  field<HTMLInputElement>('hideSkippedEnabled').checked = settings.hideSkippedEnabled;
  field<HTMLInputElement>('scheduleBlockEnabled').checked = settings.scheduleBlockEnabled;
  field<HTMLInputElement>('dailyLimitEnabled').checked = settings.dailyLimitEnabled;
  field<HTMLInputElement>('dailyLimitMinutes').value = String(settings.dailyLimitMinutes);
  windows = settings.blockWindows.map((w) => ({ ...w }));
  renderWindows();
  renderSummary(settings);
}

async function renderUsage(): Promise<void> {
  try {
    const today = dayKey(new Date());
    const record = normalizeRecord((await chrome.storage.local.get(USAGE_KEY))[USAGE_KEY], today);
    const total = totalSkips(record);
    const todayCount = record.skipHistory[today] ?? 0;
    usageReadout.textContent = `本日の視聴: ${formatMinutes(record.seconds)}／「次へ」累計 ${total} 回（本日 ${todayCount} 回）`;
    usageChart.innerHTML = total > 0 ? skipChartSvg(recentSkips(record, today, 14)) : '';
  } catch {
    usageReadout.textContent = '';
    usageChart.innerHTML = '';
  }
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
    await renderUsage();
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
    cardWidth: Number(field<HTMLInputElement>('cardWidth').value),
    watchVisibleCount: Number(field<HTMLInputElement>('watchVisibleCount').value),
    hideShorts: field<HTMLInputElement>('hideShorts').checked,
    durationFilterEnabled: field<HTMLInputElement>('durationFilterEnabled').checked,
    durationMinMinutes: Number(field<HTMLInputElement>('durationMinMinutes').value),
    durationMaxMinutes: Number(field<HTMLInputElement>('durationMaxMinutes').value),
    hideSkippedEnabled: field<HTMLInputElement>('hideSkippedEnabled').checked,
    scheduleBlockEnabled: field<HTMLInputElement>('scheduleBlockEnabled').checked,
    blockWindows: sanitizeWindows(windows),
    dailyLimitEnabled: field<HTMLInputElement>('dailyLimitEnabled').checked,
    dailyLimitMinutes: Number(field<HTMLInputElement>('dailyLimitMinutes').value),
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
  addWindowButton.addEventListener('click', () => {
    windows.push({ start: '00:00', end: '07:00' });
    renderWindows();
  });
  form.addEventListener('submit', (event) => void handleSave(event as SubmitEvent));
  void loadSettings();
}

init();
