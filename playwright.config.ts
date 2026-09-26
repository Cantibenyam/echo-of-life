import { defineConfig, devices } from '@playwright/test';

// Runs against the production build (vite preview) at the Pages base path.
// Uses the locally installed Google Chrome (channel: 'chrome').
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/echo-of-life/',
    channel: 'chrome',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 5'], channel: 'chrome', viewport: { width: 375, height: 667 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/echo-of-life/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
