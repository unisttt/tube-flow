const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    include: ['tests/unit/**/*.spec.js']
  }
});
