import { test, expect, devices, type Browser, type Page } from '@playwright/test'

// Calls between the agronomist and the farmer's phone: the voice callback and the live video call.
const API = 'http://127.0.0.1:8011'
const post = (path: string) => fetch(API + path, { method: 'POST' })
const key = (page: Page, k: string) => page.getByTestId(`key-${k}`).click()
const lcd = (page: Page) => page.getByTestId('lcd')
const screen = (page: Page) => page.getByTestId('keypad-screen')
const nav = (page: Page, name: RegExp) => page.getByRole('navigation').getByRole('button', { name })
const phone = async (browser: Browser) => (await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone', 'camera'] })).newPage()
const laptop = async (browser: Browser) => (await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone', 'camera'] })).newPage()

test.beforeEach(async () => { await post('/api/admin/reset') })

async function setUp(page: Page, kind: 'keypad' | 'smart', farmer = 'Farmer 2, Okara') {
  await page.goto('/farmer')
  await page.getByTestId(`choose-${kind}`).click()
  await page.getByLabel('Farmer').selectOption({ label: farmer })
  await page.getByTestId('setup-start').click()
}

/** The farmer asks the sugarcane question on the button phone; it goes to the agronomists. */
async function askHardQuestion(farmer: Page) {
  await key(farmer, 'call')
  await expect(screen(farmer)).toContainText('Press 1 for Punjabi')
  for (const [k, t] of [['1', 'speaking to an AI'], ['1', 'Our record says'], ['1', 'Which crop?'], ['4', 'Since when?']]) { await key(farmer, k); await expect(screen(farmer)).toContainText(t) }
  await key(farmer, '1')
  await farmer.getByTestId('pick-question').click()
  await farmer.getByTestId('phone-sample-hard_redrot').click()
  await expect(screen(farmer)).toContainText('Sent to an agronomist')
  await key(farmer, 'end')
}

/** Hamza drafts, Dr. Ayesha approves. */
async function answerAsAgronomists(expert: Page) {
  await expert.goto('/expert')
  await expert.getByRole('button', { name: /Hamza Tariq/ }).click()
  await nav(expert, /Questions/).click()
  await expert.getByRole('button', { name: /کماد کے گنے/ }).click()
  await expert.getByPlaceholder('جواب آسان اردو میں لکھیں').fill('یہ کماد کا رتا روگ لگتا ہے۔ متاثرہ گنے جڑ سمیت نکال کر کھیت سے باہر تلف کریں۔')
  await expert.getByRole('button', { name: 'Send draft for review' }).click()
  await expect(expert.getByText('Draft sent for senior review')).toBeVisible()
  await expert.getByRole('button', { name: 'Back' }).click()
  await nav(expert, /Profile/).click()
  await expert.getByRole('button', { name: 'Switch account' }).click()
  await expert.getByRole('button', { name: /Dr. Ayesha Malik/ }).click()
  await nav(expert, /Questions/).click()
  await expert.getByRole('button', { name: /Draft to review/ }).click()
  await expert.getByRole('button', { name: /^Approve/ }).first().click()
}

test('the answer arrives as a call on the smartphone too, and a missed call rings when the phone comes back', async ({ browser }) => {
  test.setTimeout(150_000)
  const farmer = await phone(browser)
  await setUp(farmer, 'keypad')
  await askHardQuestion(farmer)
  // The farmer switches to the smartphone before the answer comes.
  await farmer.getByRole('button', { name: 'Settings' }).click()
  await farmer.getByTestId('phone-settings').getByRole('tab', { name: 'Smartphone' }).click()
  await farmer.getByRole('button', { name: 'Close' }).click()
  await expect(farmer.getByTestId('chat')).toBeVisible()

  const expert = await phone(browser)
  await answerAsAgronomists(expert)

  const call = farmer.getByTestId('call-overlay')
  await expect(call).toContainText('Incoming call')
  await call.getByRole('button', { name: 'Answer' }).click()
  await expect(call).toContainText('In call')
  await expect(call).toContainText('رتا روگ')
  await call.getByRole('button', { name: 'End call' }).click()
  await expect(farmer.getByTestId('call-overlay')).toHaveCount(0)

  // Same answer, but the phone was away: opening the farmer app again rings the missed call.
  const again = await phone(browser)
  await post('/api/admin/reset')
  await setUp(again, 'keypad')
  await askHardQuestion(again)
  await again.close()
  await answerAsAgronomists(await phone(browser))
  const back = await phone(browser)
  await setUp(back, 'keypad')
  await expect(lcd(back)).toContainText('Incoming call')
  await back.keyboard.press('Enter')                                         // green call key (the phone is shaking)
  await expect(screen(back)).toContainText('approved by the agronomist')
})

test('the agronomist video-calls the farmer’s smartphone and the two connect', async ({ browser }) => {
  test.setTimeout(120_000)
  const farmer = await phone(browser)
  await setUp(farmer, 'smart')
  await farmer.getByPlaceholder('سنیہا لکھو').fill('میرے کماد کے گنے اندر سے لال ہو گئے ہیں، چیرنے پر لال رنگ میں سفید دھبے ہیں اور کھٹی بو آتی ہے')
  await farmer.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(farmer.getByTestId('msg-escalated')).toBeVisible()

  const expert = await laptop(browser)
  await expert.goto('/expert')
  await expert.getByRole('button', { name: /Hamza Tariq/ }).click()
  await nav(expert, /Questions/).click()
  await expert.getByRole('button', { name: /کماد کے گنے/ }).click()
  await expert.getByRole('button', { name: /Video call the farmer/ }).click()

  await expect(farmer.getByText('Incoming video call')).toBeVisible()
  await farmer.getByRole('button', { name: 'Accept' }).click()
  await expect(expert.getByText('Video call, live')).toBeVisible({ timeout: 30_000 })   // the farmer's picture reached the agronomist
  await expect(farmer.getByText('Video call, live')).toBeVisible({ timeout: 30_000 })
  await expert.getByRole('button', { name: 'End call' }).click()
  await expect(farmer.getByText('Call ended')).toBeVisible()
})

test('a video call to a farmer on a button phone is shown with a note, and can be declined', async ({ browser }) => {
  const farmer = await phone(browser)
  await setUp(farmer, 'keypad')
  await askHardQuestion(farmer)
  const expert = await laptop(browser)
  await expert.goto('/expert')
  await expert.getByRole('button', { name: /Hamza Tariq/ }).click()
  await nav(expert, /Questions/).click()
  await expert.getByRole('button', { name: /کماد کے گنے/ }).click()
  await expert.getByRole('button', { name: /Video call the farmer/ }).click()
  await expect(farmer.getByTestId('video-on-keypad')).toContainText('needs the farmer’s smartphone')
  await expect(farmer.getByText('Incoming video call')).toBeVisible()
  await farmer.getByRole('button', { name: 'Decline' }).click()
  await expect(expert.getByText('Call ended')).toBeVisible()
})

test('with live updates blocked on the farmer phone, the answer still rings within seconds', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone', 'camera'] })
  await ctx.routeWebSocket(/\/ws/, (ws) => ws.close())          // a network or tunnel that blocks WebSockets
  const farmer = await ctx.newPage()
  await setUp(farmer, 'keypad')
  await askHardQuestion(farmer)
  await answerAsAgronomists(await phone(browser))
  await expect(lcd(farmer)).toContainText('Incoming call', { timeout: 20_000 })
  await farmer.keyboard.press('Enter')
  await expect(screen(farmer)).toContainText('approved by the agronomist')
})
