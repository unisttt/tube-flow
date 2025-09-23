const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/integration',
  timeout: 90000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    headless: !!process.env.CI,
    ignoreHTTPSErrors: true
  },
  reporter: [['list']]
});
