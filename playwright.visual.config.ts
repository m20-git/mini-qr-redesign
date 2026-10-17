import { defineConfig, devices } from '@playwright/test'
import functional from './playwright.config'

export default defineConfig({
  ...functional,
  testDir: './tests/visual',
  testMatch: '**/*.visual.spec.ts',
  outputDir: 'test-results/visual',
  snapshotPathTemplate: '{testDir}/../e2e/create.spec.ts-snapshots/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [['line'], ['html', { outputFolder: 'playwright-report/visual', open: 'never' }]],
  expect: {
    timeout: 10000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide', scale: 'css' }
  },
  use: {
    ...functional.use,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    storageState: { cookies: [], origins: [] },
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } }],
  webServer: { ...functional.webServer, command: 'pnpm dev --host 127.0.0.1 --port 5188 --strictPort', reuseExistingServer: false }
})
