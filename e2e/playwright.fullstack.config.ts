import { defineConfig, devices } from '@playwright/test'

const chromium = { launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } }
// The real API + a real Postgres (not demo mode). Serial, because the tests share one database.
export default defineConfig({
  testDir: './fullstack',
  timeout: 60_000, workers: 1, fullyParallel: false, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4180', trace: 'off', ...chromium },
  webServer: { command: 'sudo bash ../api/test/e2e-server.sh', url: 'http://127.0.0.1:4180/api/config', reuseExistingServer: false, timeout: 120_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 }, ...chromium } },
    { name: 'pixel', use: { ...devices['Pixel 7'], ...chromium } },
  ],
})
