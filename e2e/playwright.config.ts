import { defineConfig } from '@playwright/test'

// One throwaway offline server (own data folder, no language model), one browser, tests run one after another.
export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8011',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
    permissions: ['microphone'],
    trace: 'retain-on-failure',
  },
  webServer: { command: './start-server.sh', url: 'http://127.0.0.1:8011/api/health', reuseExistingServer: true, timeout: 60_000 },
})
