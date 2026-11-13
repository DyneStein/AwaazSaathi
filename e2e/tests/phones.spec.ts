import { test, expect, devices, type Browser, type Page } from '@playwright/test'

// The demo as judges see it: each person on their own phone, the operations map on the laptop, all live.
const API = 'http://127.0.0.1:8011'
const post = (path: string) => fetch(API + path, { method: 'POST' })
const key = (page: Page, k: string) => page.getByTestId(`key-${k}`).click()
const lcd = (page: Page) => page.getByTestId('lcd')
const screen = (page: Page) => page.getByTestId('keypad-screen')
const nav = (page: Page, name: RegExp) => page.getByRole('navigation').getByRole('button', { name })
const phone = async (browser: Browser) => (await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone'] })).newPage()

test.beforeEach(async () => { await post('/api/admin/reset') })

/** First run on a phone: pick the phone type and the farmer. */
async function setUp(page: Page, kind: 'keypad' | 'smart', farmer = 'Farmer 2, Okara') {
  await page.goto('/farmer')
  await expect(page.getByTestId('phone-setup')).toBeVisible()
  await expect(page.getByTestId('setup-start')).toBeDisabled()
  await page.getByTestId(`choose-${kind}`).click()
  await page.getByLabel('Farmer').selectOption({ label: farmer })
  await page.getByTestId('setup-start').click()
}

/** Dial on the full-screen button phone and walk the menu to the question. Subtitles show what the helpline says. */
async function dialToQuestion(page: Page, crop = '1') {
  await key(page, 'call')
  await expect(lcd(page)).toContainText('In call')
  await expect(screen(page)).toContainText('Press 1 for Punjabi')
  await key(page, '1')
  await expect(screen(page)).toContainText('You are speaking to an AI')
  await key(page, '1')
  await expect(screen(page)).toContainText('Our record says this is your tehsil')
  await key(page, '1')
  await expect(screen(page)).toContainText('Which crop?')
  await key(page, crop)
  await expect(screen(page)).toContainText('Since when?')
  await key(page, '1')
  await expect(page.getByTestId('pick-question')).toBeVisible()
}

test.describe('farmer on a real phone', () => {
  test('first run asks for the phone type, the call works with the question picker, and settings switch the phone', async ({ browser }) => {
    const page = await phone(browser)
    await setUp(page, 'keypad')
    await expect(screen(page)).toBeVisible()
    await expect(lcd(page)).toContainText('0800 29229')
    await dialToQuestion(page)
    await page.getByTestId('pick-question').click()
    await page.getByTestId('phone-sample-common_aphid').click()
    await expect(screen(page)).toContainText('Reviewed answer: Wheat aphid')
    await key(page, 'end')
    await expect(lcd(page)).toContainText('Call ended')

    // Switch to the smartphone in Settings; the choice survives a reload.
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByTestId('phone-settings').getByRole('tab', { name: 'Smartphone' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('chat')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('chat')).toBeVisible()
    await expect(page.getByTestId('keypad-screen')).toHaveCount(0)

    // The smartphone chat answers a typed question.
    await page.getByPlaceholder('سنیہا لکھو').fill('کپاس کے پتوں کے نیچے سفید مکھی بہت ہے اور پتے چپچپے ہیں')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByTestId('msg-answer')).toBeVisible()

    // Start setup again returns to the first screen.
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Start setup again' }).click()
    await expect(page.getByTestId('phone-setup')).toBeVisible()
  })

  test('a laptop opens the presenter stage; ?device=phone forces the phone screens', async ({ page }) => {
    await page.goto('/farmer')
    await expect(page.getByTestId('keypad-phone')).toBeVisible()
    await expect(page.getByTestId('chat')).toBeVisible()
    await page.goto('/farmer?device=phone')
    await expect(page.getByTestId('phone-setup')).toBeVisible()
  })
})

test('three phones and the map: question, agronomist answer, callback, outbreak, dealer alert', async ({ browser }) => {
  test.setTimeout(180_000)
  const map = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await map.goto('/admin')
  await expect(map.getByTestId('ops-totals')).toContainText('54')
  const questions = async () => Number((await map.getByTestId('ops-totals').locator('dd').nth(1).innerText()).trim())
  const before = await questions()

  // Phone 1: the farmer calls from a button phone with a question the AI must not answer.
  const farmer = await phone(browser)
  await setUp(farmer, 'keypad')
  await dialToQuestion(farmer, '4')
  await farmer.getByTestId('pick-question').click()
  await farmer.getByTestId('phone-sample-hard_redrot').click()
  await expect(screen(farmer)).toContainText('Sent to an agronomist')
  await key(farmer, 'end')
  await expect.poll(questions).toBe(before + 1)                               // the map updates live

  // Phone 2: the agronomists. Junior drafts, senior approves.
  const expert = await phone(browser)
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

  // Phone 1 rings with the answer.
  await expect(lcd(farmer)).toContainText('Incoming call')
  await farmer.keyboard.press('Enter')                                       // green call key (the phone is shaking)
  await expect(screen(farmer)).toContainText('approved by Dr. Ayesha Malik')

  // Phone 3: the dealer logs in, then the outbreak fires.
  const dealer = await phone(browser)
  await dealer.goto('/dealer')
  await dealer.getByPlaceholder('4 digits').fill('1111')
  await dealer.getByRole('button', { name: 'Log in' }).click()
  await expect(dealer.getByText('No outbreak needs you')).toBeVisible()
  await post('/api/admin/canned/rust_okara_2'); await post('/api/admin/canned/rust_okara_3')
  await expect(dealer.getByTestId('outbreak-banner')).toContainText('Outbreak near you: Okara')
  await expect(lcd(farmer)).toContainText('New voice message', { timeout: 20_000 })   // the Okara farmer is alerted too

  // The map shows the outbreak and the Okara details.
  await map.getByRole('button', { name: /Wheat yellow.*in Okara/ }).click()
  const panel = map.getByTestId('tehsil-panel')
  await expect(panel).toContainText('Outbreak: Wheat yellow')
  await expect(panel).toContainText('Aslam Zarai Markaz')
})

test.describe('operations map and connect page', () => {
  test('the map shows the pilot area, filters by period and opens a tehsil', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByTestId('ops-totals')).toContainText('Registered farmers')
    await expect.poll(() => page.locator('.leaflet-interactive').count()).toBeGreaterThan(60)
    const month = await page.getByTestId('ops-totals').locator('dd').nth(1).innerText()
    await page.getByRole('tab', { name: 'Last 7 days' }).click()
    await expect(page.getByTestId('ops-totals').locator('dd').nth(1)).not.toHaveText(month)
    await page.getByLabel('Map layers').getByLabel('Questions').uncheck()
    await expect.poll(() => page.locator('.leaflet-interactive').count()).toBeLessThan(60)
    await page.getByRole('button', { name: 'Demo control' }).click()
    await expect(page.getByRole('button', { name: 'Reset demo' })).toBeVisible()
    await page.getByRole('button', { name: 'Overview' }).click()
    await expect(page.getByTestId('ops-map')).toBeVisible()
  })

  test('the connect page has a QR code for each phone and offers the internet link', async ({ page }) => {
    await page.goto('/connect')
    for (const [role, path] of [['farmer', '/farmer?device=phone'], ['expert', '/expert'], ['dealer', '/dealer']]) {
      const img = page.getByTestId(`qr-${role}`).locator('img')
      await expect(img).toHaveAttribute('src', new RegExp(encodeURIComponent(path).replace(/[?]/g, '\\?')))
      expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
    }
    await page.getByRole('tab', { name: /Any network/ }).click()
    await expect(page.getByTestId('internet-link')).toContainText(/Let phones join from any network|Internet link is on/)
  })
})
