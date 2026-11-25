import { defineConfig, devices } from '@playwright/test'

const chromium = { channel: undefined, launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } }
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'off', ...chromium },
  webServer: {
    command: 'npm --prefix ../web run build && npm --prefix ../web run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 180_000,
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium', ...chromium } },
    { name: 'pixel', use: { ...devices['Pixel 7'], ...chromium } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 }, ...chromium } },
  ],
})
