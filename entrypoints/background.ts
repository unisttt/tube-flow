import { defineBackground } from 'wxt/sandbox';
import {
  COMMAND_TO_MESSAGE,
  SOURCE,
  isTubeFlowMessage,
  type TubeFlowMessage,
} from '../lib/messaging';

const NS = '[TubeFlow][BG]';

export default defineBackground(() => {
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

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isTubeFlowMessage(message) || message.type !== 'request-exit') {
      return;
    }
    handleRequestExit(sender.tab, message.reason)
      .then((ok) => sendResponse({ ok }))
      .catch((error) => {
        console.warn(`${NS} exit request failed`, error);
        sendResponse({ ok: false });
      });
    return true;
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

async function handleRequestExit(
  tab: chrome.tabs.Tab | undefined,
  reason?: string,
): Promise<boolean> {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  try {
    await chrome.tabs.remove(tab.id);
    console.debug(`${NS} closed tab`, { reason, tabId: tab.id });
    return true;
  } catch (error) {
    console.warn(`${NS} tab close failed`, error);
    try {
      await chrome.tabs.update(tab.id, { url: 'https://www.youtube.com/feed/subscriptions' });
      return true;
    } catch (secondary) {
      console.warn(`${NS} fallback navigation failed`, secondary);
      return false;
    }
  }
}
