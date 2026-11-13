import { test, expect, devices } from '@playwright/test'

// Phone browsers only allow sound that a tap started. This file runs Chromium with that rule switched on.
test.use({ ...devices['Pixel 7'], launchOptions: { args: ['--mute-audio', '--autoplay-policy=document-user-activation-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

const API = 'http://127.0.0.1:8011'
test.beforeEach(async () => { await fetch(API + '/api/admin/reset', { method: 'POST' }) })

test('on a phone the helpline voice plays at every step, including the answer after the microphone was used', async ({ page }) => {
  const played = () => page.evaluate(() => (window as any).__awaazPlayed || 0)
  const key = (k: string) => page.getByTestId(`key-${k}`).click()
  const screen = page.getByTestId('keypad-screen')
  await page.goto('/farmer')
  await page.getByTestId('choose-keypad').click()
  await page.getByTestId('setup-start').click()
  await key('call')
  await expect(screen).toContainText('Press 1 for Punjabi')
  await expect.poll(played).toBeGreaterThan(0)                         // the welcome is heard, not just shown
  for (const [k, t] of [['1', 'speaking to an AI'], ['1', 'Our record says'], ['1', 'Which crop?'], ['1', 'Since when?']]) { await key(k); await expect(screen).toContainText(t) }
  await key('1')
  await expect(page.getByText('Listening. Speak, then press any key.')).toBeVisible({ timeout: 30_000 })   // the microphone is on
  const before = await played()
  await page.getByTestId('pick-question').click()
  await page.getByTestId('phone-sample-common_aphid').click()
  await expect(screen).toContainText('Reviewed answer: Wheat aphid')
  await expect.poll(played, { timeout: 20_000 }).toBeGreaterThan(before)   // the answer arrives seconds after the last tap and is still heard
  await expect(page.getByTestId('sound-gate')).toHaveCount(0)
})
