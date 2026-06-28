import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3000;
const API_PORT = process.env.PORT ?? '8080';
const FAKE_PORT = 8090;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/fake-openrouter.mjs',
      url: `http://localhost:${FAKE_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'cd ../api && go run .',
      url: `http://localhost:${API_PORT}/readyz`,
      env: {
        OPENROUTER_BASE_URL: `http://localhost:${FAKE_PORT}`,
        GOOGLE_AUTH_FAKE: '1',
        GOOGLE_CLIENT_ID: 'e2e-dummy',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'e2e-dummy' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
