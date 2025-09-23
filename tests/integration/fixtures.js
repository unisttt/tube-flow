const { test: base, chromium, expect } = require('@playwright/test');
const path = require('path');

const extensionPath = path.join(__dirname, '..', '..');
const headless = !!process.env.CI;

const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check'
      ]
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    const url = serviceWorker.url();
    const extensionId = url.split('/')[2];
    await use(extensionId);
  }
});

module.exports = { test, expect };
