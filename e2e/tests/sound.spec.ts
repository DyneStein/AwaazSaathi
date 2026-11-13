import { test, expect, devices } from '@playwright/test'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

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

test('a voice clip that fails to download the first times (tunnel 502) is retried and still plays', async ({ page }) => {
  let fails = 0
  await page.route('**/media/tts/**', async (route) => { if (fails < 2) { fails++; await route.fulfill({ status: 502, body: 'Bad gateway' }) } else await route.continue() })
  const played = () => page.evaluate(() => (window as any).__awaazPlayed || 0)
  await page.goto('/farmer')
  await page.getByTestId('choose-keypad').click()
  await page.getByTestId('setup-start').click()
  await page.getByTestId('key-call').click()
  await expect.poll(played, { timeout: 30_000 }).toBeGreaterThan(0)
  expect(fails).toBe(2)
})

test('the agronomist’s answer is spoken when the farmer picks up the callback, even on a slow link', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/media/tts/**', async (route) => { await new Promise((r) => setTimeout(r, 4000)); await route.continue() })
  const played = () => page.evaluate(() => (window as any).__awaazPlayed || 0)
  const key = (k: string) => page.getByTestId(`key-${k}`).click()
  const sc = page.getByTestId('keypad-screen')
  await page.goto('/farmer')
  await page.getByTestId('choose-keypad').click()
  await page.getByLabel('Farmer').selectOption({ label: 'Farmer 2, Okara' })
  await page.getByTestId('setup-start').click()
  await key('call'); await expect(sc).toContainText('Press 1 for Punjabi', { timeout: 20_000 })
  for (const [k, t] of [['1', 'speaking to an AI'], ['1', 'Our record says'], ['1', 'Which crop?'], ['4', 'Since when?']]) { await key(k); await expect(sc).toContainText(t, { timeout: 20_000 }) }
  await key('1'); await page.getByTestId('pick-question').click(); await page.getByTestId('phone-sample-hard_redrot').click()
  await expect(sc).toContainText('Sent to an agronomist', { timeout: 30_000 }); await key('end')
  const q = (await (await fetch(API + '/api/expert/queue?expert_id=1')).json()).find((x: any) => x.transcript.includes('کماد'))
  const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  // The test server is offline and cannot synthesise new speech, so the answer's clip is put in place the way the
  // server names it (voice | intro + answer); a real server makes it online.
  const answer = 'یہ کماد کا رتا روگ لگتا ہے۔ متاثرہ گنے نکال کر تلف کریں۔'
  const intro = (await (await fetch(API + '/api/prompts?lang=pa')).json()).callback_intro.text
  const name = createHash('sha256').update(`ur-PK-AsadNeural|${intro} ${answer}`).digest('hex').slice(0, 24) + '.mp3'
  const dir = path.resolve(__dirname, '../../backend/media/tts')
  const clip = path.join(dir, name)
  fs.copyFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.mp3'))!), clip)
  test.info().attach('clip', { body: name })
  try {
    await fetch(`${API}/api/expert/query/${q.id}/draft`, json({ expert_id: 5, text: answer }))
    await fetch(`${API}/api/expert/query/${q.id}/review`, json({ reviewer_id: 1, action: 'approve' }))
    await expect(page.getByTestId('lcd')).toContainText('Incoming call', { timeout: 20_000 })
    const before = await played()
    await page.keyboard.press('Enter')                                                // pick up
    await expect.poll(played, { timeout: 30_000 }).toBeGreaterThan(before)             // the answer is heard
    await expect(page.getByTestId('sound-gate')).toHaveCount(0)
  } finally { fs.rmSync(clip, { force: true }) }
})
