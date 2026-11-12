import { test, expect, type Page } from '@playwright/test'

const API = 'http://127.0.0.1:8011'
const post = (path: string) => fetch(API + path, { method: 'POST' })
const nav = (page: Page, name: RegExp) => page.getByRole('navigation').getByRole('button', { name })
const key = (page: Page, k: string) => page.getByTestId(`key-${k}`).click()
const lcd = (page: Page) => page.getByTestId('lcd')
const captions = (page: Page) => page.getByTestId('captions')

test.beforeEach(async () => { await post('/api/admin/reset') })

/** Dial the helpline on the button phone and walk the keypad menu up to "describe your problem". */
async function callToQuestion(page: Page, crop = '1') {
  await page.goto('/farmer')
  await expect(lcd(page)).toContainText('0800 29229')
  await key(page, 'call')
  await expect(captions(page)).toContainText('Welcome to AwaazSaathi')
  await expect(lcd(page)).toContainText('In call')
  await key(page, '1')                                              // Punjabi
  await expect(captions(page)).toContainText('You are speaking to an AI')
  await key(page, '1')                                              // skip the notice
  await expect(captions(page)).toContainText('Our record says this is your tehsil')
  await key(page, '1')                                              // tehsil is right
  await expect(captions(page)).toContainText('Which crop?')
  await key(page, crop)
  await expect(captions(page)).toContainText('Since when?')
  await key(page, '1')
  await expect(captions(page)).toContainText('After the beep, describe the problem')
}

test.describe('farmer: button phone', () => {
  test('a common question is answered by the AI from the knowledge base, then the recording is deleted', async ({ page }) => {
    await callToQuestion(page)
    await page.getByTestId('sample-common_aphid').click()
    const decision = page.getByTestId('decision')
    await expect(decision).toContainText('All safety checks passed')
    await expect(decision).toContainText('Wheat aphid')
    await expect(decision).toContainText('word for word')
    await expect(decision).toContainText('awaiting agronomist sign-off')
    await expect(captions(page)).toContainText('Reviewed answer: Wheat aphid')
    await key(page, '5')                                            // any key skips the speech
    await expect(captions(page)).toContainText('1 new question, 2 end call')
    await key(page, '2')
    await expect(captions(page)).toContainText('May we keep this recording')
    await key(page, '2')
    await expect(captions(page)).toContainText('Your recording has been deleted')
    await expect(lcd(page)).toContainText('Call ended', { timeout: 30_000 })
  })

  test('a question outside the knowledge base is not answered', async ({ page }) => {
    await callToQuestion(page, '4')
    await page.getByTestId('sample-hard_redrot').click()
    await expect(page.getByTestId('decision')).toContainText('Not covered by knowledge base')
    await expect(page.getByTestId('decision')).toContainText('Junior drafts, senior approves')
    await expect(captions(page)).toContainText('Sent to an agronomist')
  })

  test('a dose question and a poisoning emergency both go to a senior', async ({ page }) => {
    await callToQuestion(page, '2')
    await page.getByTestId('sample-dose_whitefly').click()
    await expect(page.getByTestId('decision')).toContainText('Asks for a dose')
    await expect(page.getByTestId('decision')).toContainText('Senior only')
    await key(page, '5'); await key(page, '1')                      // skip speech, new question
    await expect(captions(page).getByText('After the beep').nth(1)).toBeVisible()
    await page.getByLabel('Type the farmer’s question').fill('سپرے کرنے کے بعد میرے بیٹے کو چکر آ رہے ہیں اور الٹی ہو رہی ہے')
    await page.getByRole('button', { name: 'Send typed question' }).click()
    await expect(page.getByTestId('decision')).toContainText('Health emergency')
    await expect(captions(page)).toContainText('ہسپتال')            // told to go to hospital
  })

  test('the phone records after the beep and says so when speech cannot be understood', async ({ page }) => {
    await callToQuestion(page)
    await key(page, '7')                                            // skip the prompt: beep, then recording starts
    await expect(lcd(page)).toContainText('Listening...')
    await page.waitForTimeout(1500)
    await key(page, '#')                                            // any key finishes
    await expect(page.getByRole('alert')).toContainText('The recording could not be understood')
    await expect(lcd(page)).not.toContainText('Listening...')
  })

  test('the end key hangs up and number keys do nothing while idle', async ({ page }) => {
    await page.goto('/farmer')
    await key(page, '5')
    await expect(lcd(page)).toContainText('Press the call key')
    await key(page, 'call')
    await expect(lcd(page)).toContainText('In call')
    await key(page, 'end')
    await expect(lcd(page)).toContainText('Call ended')
  })

  test('the keyboard drives the phone', async ({ page }) => {
    await page.goto('/farmer')
    await expect(lcd(page)).toContainText('0800 29229')
    await page.keyboard.press('Enter')
    await expect(captions(page)).toContainText('Welcome to AwaazSaathi')
    await page.keyboard.press('2')                                  // Urdu
    await expect(captions(page)).toContainText('Farmer pressed 2')
    await page.keyboard.press('Escape')
    await expect(lcd(page)).toContainText('Call ended')
  })
})

test.describe('expert review and the callback', () => {
  test('junior drafts, senior edits and approves, the farmer’s phone rings, the answer joins the knowledge base', async ({ browser }) => {
    test.setTimeout(120_000)
    const farmer = await (await browser.newContext()).newPage()
    await callToQuestion(farmer, '4')
    await farmer.getByTestId('sample-hard_redrot').click()
    await expect(farmer.getByTestId('decision')).toContainText('Not covered by knowledge base')
    await key(farmer, '5'); await key(farmer, '2'); await key(farmer, '2')      // skip, end call, delete recording
    await expect(lcd(farmer)).toContainText('Call ended', { timeout: 30_000 })

    const expert = await (await browser.newContext()).newPage()
    await expert.goto('/expert')
    await expert.getByRole('button', { name: /Hamza Tariq/ }).click()
    await expect(expert.getByTestId('mine-count')).toHaveText('2')              // the seeded routine question and the new one
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
    const box = expert.locator('textarea')
    await expect(box).toHaveValue(/رتا روگ/)
    await box.fill((await box.inputValue()).replace('رتا روگ', 'رتا روگ (ریڈ راٹ)'))
    await expect(expert.getByText('Your changes')).toBeVisible()
    await expert.getByRole('button', { name: 'Approve with edits' }).click()

    await expect(lcd(farmer)).toContainText('Incoming call')                    // the button phone rings
    await farmer.keyboard.press('Enter')                                        // green call key (the phone is shaking)
    await expect(captions(farmer)).toContainText('ریڈ راٹ')
    await expect(captions(farmer)).toContainText('approved by Dr. Ayesha Malik')

    await expert.getByRole('button', { name: 'Add to knowledge base' }).click()
    await expect(expert.getByText('Added to knowledge base. The AI answers this now.')).toBeVisible()
    await expert.getByRole('button', { name: 'Back' }).click()
    await nav(expert, /Knowledge/).click()
    await expect(expert.getByTestId('kb-list').locator('li').first()).toContainText('From an expert answer')
  })

  test('the expert app has working tabs, knowledge search and senior sign-off', async ({ page }) => {
    await page.goto('/expert')
    await page.getByRole('button', { name: /Dr. Ayesha Malik/ }).click()
    await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(4)
    await nav(page, /Knowledge/).click()
    await expect(page.getByTestId('kb-list').locator('li')).toHaveCount(18)
    await page.getByLabel('Search the knowledge base').fill('safed makhi')
    await expect(page.getByTestId('kb-list').locator('li').first()).toContainText('whitefly', { ignoreCase: true })
    await page.getByTestId('kb-list').locator('button').first().click()
    await page.getByRole('button', { name: 'Sign off this entry' }).click()
    await expect(page.getByRole('dialog')).toContainText('Signed off by Dr. Ayesha Malik')
    await page.getByRole('button', { name: 'Close' }).click()
    await nav(page, /Profile/).click()
    await expect(page.getByText('Payout balance')).toBeVisible()
    await nav(page, /Home/).click()
    await expect(page.getByText('Recently answered')).toBeVisible()
  })

  test('a junior cannot answer a senior-only question', async ({ page }) => {
    await page.goto('/expert')
    await page.getByRole('button', { name: /Hamza Tariq/ }).click()
    await nav(page, /Questions/).click()
    await page.getByRole('button', { name: /Senior only/ }).click()
    await expect(page.getByText('A senior agronomist must answer.')).toBeVisible()
    await expect(page.locator('textarea')).toHaveCount(0)
  })
})

test.describe('farmer: smartphone', () => {
  test('a typed question is answered in the chat and can still be sent to a human', async ({ page }) => {
    await page.goto('/farmer')
    await page.getByLabel('Message').fill('کپاس کے پتوں کے نیچے چھوٹی سفید مکھیاں ہیں، ہلانے پر اڑتی ہیں')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    const answer = page.getByTestId('msg-answer')
    await expect(answer).toBeVisible()
    await expect(page.getByTestId('decision')).toContainText('whitefly', { ignoreCase: true })
    await answer.getByRole('button', { name: /ماہر/ }).click()
    await expect(answer).toContainText('گھل دتا')                   // "sent to the expert" (Punjabi)
  })

  test('a photo with a question is sent, and the expert’s reply arrives in the chat, not as a call', async ({ page, request }) => {
    await page.goto('/farmer')
    await page.getByTestId('photo-input').setInputFiles({ name: 'leaf.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') })
    await page.getByLabel('Message').fill('میرے کماد کے گنے اندر سے لال ہو گئے ہیں اور کھٹی بو آتی ہے')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByTestId('msg-escalated')).toBeVisible()
    await expect(page.getByTestId('chat').locator('img[alt="Crop photo"]')).toBeVisible()
    const q = (await (await request.get(`${API}/api/expert/queue?expert_id=1`)).json()).find((x: any) => x.channel === 'photo')
    await request.post(`${API}/api/expert/query/${q.id}/draft`, { data: { expert_id: 1, text: 'متاثرہ گنے نکال کر تلف کریں۔' } })
    await expect(page.getByTestId('msg-callback')).toContainText('متاثرہ گنے نکال کر تلف کریں')
    await expect(lcd(page)).not.toContainText('Incoming call')
  })

  test('an outbreak alert reaches both phones of a farmer in that tehsil', async ({ page }) => {
    await page.goto('/farmer')
    await page.locator('select').selectOption({ index: 3 })          // a farmer in Okara
    await page.waitForTimeout(500)
    await post('/api/admin/canned/rust_okara_2'); await post('/api/admin/canned/rust_okara_3')
    await expect(page.getByTestId('msg-outbreak_alert')).toBeVisible()
    await expect(lcd(page)).toContainText('New voice message')
    await page.getByRole('button', { name: /Left soft key/ }).click()
    await expect(lcd(page)).toContainText('Outbreak alert')
    await key(page, 'call')                                          // play it
    await expect(captions(page)).toContainText('Outbreak alert for the farmer’s tehsil')
  })
})

test('3-day follow-up: the phone rings, the farmer presses 2, the question returns to the experts', async ({ page, request }) => {
  await callToQuestion(page)
  await page.getByTestId('sample-common_aphid').click()
  await expect(page.getByTestId('decision')).toContainText('All safety checks passed')
  await key(page, 'end')
  await post('/api/admin/followups')
  await expect(lcd(page)).toContainText('Incoming call')
  await page.keyboard.press('Enter')
  await expect(lcd(page)).toContainText('Press 1 or 2', { timeout: 20_000 })
  await key(page, '2')
  await expect(captions(page)).toContainText('An agronomist will call you soon')
  const queue = await (await request.get(`${API}/api/expert/queue?expert_id=1`)).json()
  expect(queue.some((q: any) => q.reasons.includes('followup_still_a_problem'))).toBe(true)
})

test.describe('dealer app', () => {
  test('login, outbreak banner, stock checklist, confirm, and every tab', async ({ page }) => {
    await page.goto('/dealer')
    await page.evaluate(() => localStorage.removeItem('dealer')); await page.reload()
    await page.getByPlaceholder('4 digits').fill('9999')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('That PIN does not match this shop')).toBeVisible()
    await page.getByPlaceholder('4 digits').fill('1111')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('No outbreak needs you')).toBeVisible()
    await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(4)

    await post('/api/admin/canned/rust_okara_2'); await post('/api/admin/canned/rust_okara_3')
    await expect(page.getByTestId('outbreak-banner')).toContainText('Outbreak near you: Okara')
    const card = page.getByTestId('alert-card')
    await expect(card).toContainText('0 of 3 in stock')
    await card.getByRole('checkbox').first().click()
    await expect(card).toContainText('1 of 3 in stock')
    await card.getByRole('button', { name: 'Confirm stock is ready' }).click()
    await expect(card).toContainText('Stock confirmed')

    await nav(page, /Demand/).click()
    await expect(page.getByTestId('demand-list').locator('li').first()).toContainText('3 farmers')
    await page.getByRole('tab', { name: 'All tehsils' }).click()
    await expect(page.getByTestId('demand-list')).toContainText('Multan')
    await nav(page, /My shop/).click()
    await expect(page.getByText('Your alert area')).toBeVisible()
    await page.getByRole('switch').click()
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await nav(page, /Home/).click()
    await expect(page.getByText('All alerts handled')).toBeVisible()
    await nav(page, /My shop/).click()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByText('Log in to your shop')).toBeVisible()
  })
})

test('control panel: the safety evaluation reports zero unsafe answers', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Run evaluation' }).click()
  await expect(page.getByTestId('eval-unsafe')).toHaveText('0')
  await page.getByRole('button', { name: /Show all \d+ questions/ }).click()
  expect(await page.getByTestId('evaluation').locator('tbody tr').count()).toBeGreaterThanOrEqual(50)
})

test.describe('look and layout', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/u
  for (const path of ['/', '/farmer', '/expert', '/dealer', '/admin', '/connect']) {
    test(`no emoji and no sideways scrolling on ${path}, laptop and phone width`, async ({ page }) => {
      for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(size)
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        expect(await page.locator('body').innerText()).not.toMatch(EMOJI)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `${path} at ${size.width}px`).toBeLessThanOrEqual(1)
      }
    })
  }

  test('both phones show side by side on a laptop and one at a time on a phone', async ({ page }) => {
    await page.goto('/farmer')
    await expect(page.getByTestId('keypad-phone')).toBeVisible()
    await expect(page.getByTestId('chat')).toBeVisible()
    await page.getByRole('tab', { name: 'Smartphone' }).click()
    await expect(page.getByTestId('keypad-phone')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Button phone' }).click()
    await expect(page.getByTestId('chat')).toHaveCount(0)
  })
})
