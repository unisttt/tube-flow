const NAMESPACE = '[TubeFlow][BG]';
const COMMAND_TO_MESSAGE = {
  'tube-flow-next': 'command-next',
  'tube-flow-watch-later': 'command-watch-later'
};

chrome.runtime.onInstalled.addListener(() => {
  console.debug(`${NAMESPACE} installed`);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  const messageType = COMMAND_TO_MESSAGE[command];
  if (!messageType) {
    return;
  }
  const targetTabId = await resolveTargetTabId(tab);
  if (targetTabId === undefined) {
    return;
  }
  try {
    await chrome.tabs.sendMessage(targetTabId, {
      source: 'tube-flow',
      type: messageType,
      origin: 'command'
    });
  } catch (error) {
    console.warn(`${NAMESPACE} command dispatch failed`, error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.source !== 'tube-flow') {
    return;
  }
  if (message.type === 'request-exit') {
    handleRequestExit(sender?.tab, message.reason)
      .then((ok) => sendResponse({ ok }))
      .catch((error) => {
        console.warn(`${NAMESPACE} exit request failed`, error);
        sendResponse({ ok: false });
      });
    return true;
  }
});

async function resolveTargetTabId(tab) {
  if (tab && typeof tab.id === 'number') {
    return tab.id;
  }
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
      url: '*://www.youtube.com/*'
    });
    if (activeTab && typeof activeTab.id === 'number') {
      return activeTab.id;
    }
  } catch (error) {
    console.warn(`${NAMESPACE} tab query failed`, error);
  }
  return undefined;
}

async function handleRequestExit(tab, reason) {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  try {
    await chrome.tabs.remove(tab.id);
    console.debug(`${NAMESPACE} closed tab`, { reason, tabId: tab.id });
    return true;
  } catch (error) {
    console.warn(`${NAMESPACE} tab close failed`, error);
    try {
      await chrome.tabs.update(tab.id, { url: 'https://www.youtube.com/feed/subscriptions' });
      console.debug(`${NAMESPACE} navigated tab to subscriptions`, { tabId: tab.id });
      return true;
    } catch (secondary) {
      console.warn(`${NAMESPACE} fallback navigation failed`, secondary);
      return false;
    }
  }
}
