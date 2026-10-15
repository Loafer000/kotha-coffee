import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E configuration for Kotha & Coffee POS.
 * Configured for phone-first mobile viewport (375x667), Asia/Kolkata timezone,
 * single sequential worker (workers: 1) for database state isolation,
 * and automatic server lifecycle management via webServer block.
 */
const PORT = process.env.PORT || '3001';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || `http://localhost:${PORT}`,
    viewport: { width: 375, height: 667 }, // Standard mobile phone viewport (iPhone SE)
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
  },
  webServer: {
    command: 'npm start',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
