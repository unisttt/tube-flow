import { defineBackground } from 'wxt/sandbox';
import { COMMAND_TO_MESSAGE, SOURCE, type TubeFlowMessage } from '../lib/messaging';

const NS = '[TubeFlow][BG]';

export default defineBackground(() => {
  // キーボードコマンドを、対象の YouTube タブの content script へ仲介する。
  chrome.commands.onCommand.addListener(async (command, tab) => {
    const type = COMMAND_TO_MESSAGE[command];
    if (!type) {
      return;
    }
    const tabId = await resolveTargetTabId(tab);
    if (tabId === undefined) {
      return;
    }
    const message: TubeFlowMessage = { source: SOURCE, type, origin: 'command' };
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      console.warn(`${NS} command dispatch failed`, error);
    }
  });
});

async function resolveTargetTabId(tab?: chrome.tabs.Tab): Promise<number | undefined> {
  if (tab && typeof tab.id === 'number') {
    return tab.id;
  }
  try {
    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
      url: '*://www.youtube.com/*',
    });
    if (active && typeof active.id === 'number') {
      return active.id;
    }
  } catch (error) {
    console.warn(`${NS} tab query failed`, error);
  }
  return undefined;
}
