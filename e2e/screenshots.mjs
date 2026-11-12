// Takes a screenshot of every main screen. Usage: node screenshots.mjs [outDir] [baseUrl]
import { chromium } from '@playwright/test'
const out = process.argv[2] || 'screenshots', base = process.argv[3] || 'http://127.0.0.1:8011'
const browser = await chromium.launch({ args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` })
await fetch(`${base}/api/admin/reset`, { method: 'POST' })

await page.goto(`${base}/farmer`); await page.waitForSelector('[data-testid=keypad-phone]'); await page.waitForTimeout(600); await shot('farmer-idle')
await page.getByTestId('key-call').click(); await page.getByText('Welcome to AwaazSaathi').waitFor()
for (const k of ['1', '1', '1', '1', '1']) { await page.getByTestId(`key-${k}`).click(); await page.waitForTimeout(700) }
await page.getByTestId('sample-common_aphid').click(); await page.getByText('All safety checks passed').waitFor({ timeout: 20000 }); await page.waitForTimeout(500); await shot('farmer-answer')
await page.screenshot({ path: `${out}/farmer-answer-full.png`, fullPage: true })

await page.goto(`${base}/expert`); await page.getByText('Hamza Tariq').waitFor(); await shot('expert-login')
await page.getByText('Dr. Ayesha Malik').click(); await page.getByTestId('mine-count').waitFor(); await page.waitForTimeout(400); await shot('expert-home')
await page.getByRole('navigation').getByRole('button', { name: /Questions/ }).click(); await page.waitForTimeout(400); await shot('expert-queue')
await page.locator('ul button').first().click(); await page.waitForTimeout(600); await shot('expert-detail')
await page.getByRole('button', { name: 'Back' }).click(); await page.getByRole('navigation').getByRole('button', { name: /Knowledge/ }).click(); await page.getByTestId('kb-list').waitFor(); await shot('expert-kb')
await page.getByTestId('kb-list').locator('button').first().click(); await page.waitForTimeout(500); await shot('expert-kb-sheet')
await page.getByRole('button', { name: 'Close' }).click(); await page.getByRole('navigation').getByRole('button', { name: /Profile/ }).click(); await page.waitForTimeout(400); await shot('expert-profile')

await page.goto(`${base}/dealer`); await page.getByText('Log in to your shop').waitFor(); await shot('dealer-login')
await page.getByPlaceholder('4 digits').fill('1111'); await page.getByRole('button', { name: 'Log in' }).click(); await page.getByText('No outbreak needs you').waitFor(); await shot('dealer-home')
await fetch(`${base}/api/admin/canned/rust_okara_2`, { method: 'POST' }); await fetch(`${base}/api/admin/canned/rust_okara_3`, { method: 'POST' })
await page.getByTestId('alert-card').waitFor(); await page.waitForTimeout(500); await shot('dealer-alert')
await page.getByRole('navigation').getByRole('button', { name: /Demand/ }).click(); await page.waitForTimeout(300); await shot('dealer-demand')
await page.getByRole('navigation').getByRole('button', { name: /My shop/ }).click(); await page.waitForTimeout(300); await shot('dealer-shop')

await page.goto(`${base}/admin`); await page.getByRole('button', { name: 'Run evaluation' }).click(); await page.getByTestId('eval-unsafe').waitFor(); await page.screenshot({ path: `${out}/admin.png`, fullPage: true })
await page.goto(base); await page.waitForTimeout(300); await shot('home')

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })
const m = await phone.newPage()
await m.goto(`${base}/farmer`); await m.waitForSelector('[data-testid=keypad-phone]'); await m.screenshot({ path: `${out}/m-farmer.png`, fullPage: true })
await m.getByRole('tab', { name: 'Smartphone' }).click(); await m.waitForTimeout(300); await m.screenshot({ path: `${out}/m-farmer-smart.png` })
await m.goto(`${base}/dealer`); await m.waitForTimeout(500); await m.screenshot({ path: `${out}/m-dealer.png` })
await browser.close()
console.log('done')
