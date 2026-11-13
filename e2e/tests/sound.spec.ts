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

test('on a weak link the phone never sits in silence: a notice shows, the voice still plays, clips are cached', async ({ page }) => {
  test.setTimeout(120_000)
  // Every voice clip takes 6 s to arrive, like the 4 KB/s free tunnel.
  await page.route('**/media/tts/**', async (route) => { await new Promise((r) => setTimeout(r, 6000)); await route.continue() })
  const played = () => page.evaluate(() => (window as any).__awaazPlayed || 0)
  await page.goto('/farmer')
  await page.getByTestId('choose-keypad').click()
  await page.getByTestId('setup-start').click()
  await page.getByTestId('key-call').click()
  await expect(page.getByTestId('voice-slow')).toBeVisible({ timeout: 8_000 })        // not silence: the farmer is told
  await expect.poll(played, { timeout: 30_000 }).toBeGreaterThan(0)                   // and the welcome is then heard
  await expect(page.getByTestId('voice-slow')).toHaveCount(0)
  const cached = await page.evaluate(async () => (await (await caches.open('awaaz-voice-v1')).keys()).length)
  expect(cached).toBeGreaterThan(0)                                                   // next time it plays at once
})
