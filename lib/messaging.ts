/**
 * 拡張内メッセージの型付きプロトコル。
 * background ⇄ content ⇄ popup/options のやり取りを一本化する。
 */

export const SOURCE = 'tube-flow' as const;

/** background → content: コマンド実行 */
export type CommandType = 'command-next' | 'command-watch-later' | 'command-not-interested';

/** popup/options → content: 設定変更の即時反映 */
export type NotifyType = 'options-updated';

export type MessageType = CommandType | NotifyType;

export interface TubeFlowMessage {
  source: typeof SOURCE;
  type: MessageType;
  reason?: string;
  origin?: string;
}

export interface CommandResponse {
  ok: boolean;
  disabled?: boolean;
}

export function isTubeFlowMessage(value: unknown): value is TubeFlowMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { source?: unknown }).source === SOURCE &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

export const COMMAND_TO_MESSAGE: Record<string, CommandType> = {
  'tube-flow-next': 'command-next',
  'tube-flow-watch-later': 'command-watch-later',
  'tube-flow-not-interested': 'command-not-interested',
};

/**
 * 開いている YouTube タブ全てへメッセージを送る。
 * 「Receiving end does not exist」は content 未ロードタブなので握りつぶす。
 */
export function notifyContentScripts(type: NotifyType = 'options-updated'): void {
  const message: TubeFlowMessage = { source: SOURCE, type };
  const ignorable = (err?: chrome.runtime.LastError): boolean =>
    !err || /Receiving end does not exist/i.test(err.message ?? '');

  try {
    chrome.runtime.sendMessage(message, () => {
      if (!ignorable(chrome.runtime.lastError)) {
        console.warn('[TubeFlow][messaging] runtime notify failed', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.warn('[TubeFlow][messaging] runtime notify threw', error);
  }

  if (!chrome.tabs?.query) {
    return;
  }
  chrome.tabs.query({ url: '*://www.youtube.com/*' }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.warn('[TubeFlow][messaging] tabs query failed', chrome.runtime.lastError);
      return;
    }
    for (const tab of tabs) {
      if (typeof tab.id !== 'number') {
        continue;
      }
      try {
        chrome.tabs.sendMessage(tab.id, message, () => {
          if (!ignorable(chrome.runtime.lastError)) {
            console.warn('[TubeFlow][messaging] tab notify failed', chrome.runtime.lastError);
          }
        });
      } catch (error) {
        console.warn('[TubeFlow][messaging] tab notify threw', error);
      }
    }
  });
}
