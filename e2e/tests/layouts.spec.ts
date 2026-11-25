import { expect, test } from '@playwright/test'
import { dismissHint, login, noHScroll, stubExternal } from './helpers'

const widths = [360, 390, 430, 768, 1024, 1280, 1536]
test.describe.configure({ mode: 'parallel' })
for (const w of widths) {
  test(`layouts at ${w}px: no horizontal scroll, screenshots of viewer / organiser / admin`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 800 : 900 }, deviceScaleFactor: 1, hasTouch: w < 700 })
    const page = await ctx.newPage(); await stubExternal(page); await dismissHint(page)
    const shot = (n: string) => page.screenshot({ path: `../docs/test-report/${n}-${w}.png` })
    await page.goto('/'); await expect(page.getByTestId('poster').first()).toBeVisible(); await page.waitForTimeout(400)
    expect(await noHScroll(page)).toBe(true); await shot('viewer-board')
    await page.goto('/p/demo-002'); await expect(page.getByRole('dialog')).toBeVisible(); await page.waitForTimeout(400); await shot('viewer-enlarged')
    expect(await noHScroll(page)).toBe(true)
    await login(page, 'organiser@demo.test', 'organiser'); await expect(page.getByRole('button', { name: '+ New poster' })).toBeVisible()
    expect(await noHScroll(page)).toBe(true); await shot('organiser-list')
    await page.getByRole('button', { name: '+ New poster' }).click(); await expect(page.getByLabel('Event title *')).toBeVisible(); expect(await noHScroll(page)).toBe(true); await shot('organiser-upload')
    await page.getByRole('button', { name: 'Cancel' }).click(); await page.getByRole('button', { name: 'Log out' }).click()
    await login(page, 'admin@demo.test', 'admin'); await expect(page.getByText('Live posters', { exact: true })).toBeVisible()
    expect(await noHScroll(page)).toBe(true); await shot('admin-dashboard')
    await page.getByRole('tab', { name: 'Posters' }).click(); await expect(page.getByTestId('admin-poster').first()).toBeVisible(); expect(await noHScroll(page)).toBe(true); await shot('admin-posters')
    await page.getByRole('tab', { name: 'Organisers' }).click(); expect(await noHScroll(page)).toBe(true)
    await ctx.close()
  })
}

test('Outfit is used on organiser and admin pages too (no other font families)', async ({ page }) => {
  for (const [area, email] of [['organiser', 'organiser@demo.test'], ['admin', 'admin@demo.test']] as const) {
    await login(page, email, area); await page.waitForTimeout(500)
    if (area === 'organiser') await page.getByRole('button', { name: '+ New poster' }).click()
    await page.evaluate(() => document.fonts.ready)
    const bad = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => !(e.closest('svg') || e.tagName === 'IMG') && !getComputedStyle(e).fontFamily.toLowerCase().startsWith('outfit')).map((e) => e.tagName).slice(0, 5))
    expect(bad, area).toEqual([])
    await page.getByRole('button', { name: 'Log out' }).click()
  }
  for (const path of ['/terms', '/privacy']) {
    await page.goto(path); await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => !getComputedStyle(e).fontFamily.toLowerCase().startsWith('outfit')).length)).toBe(0)
  }
})

test('deep links survive refresh (SPA fallback) and Terms render', async ({ page }) => {
  for (const [path, text] of [['/terms', 'Terms and Conditions'], ['/organiser', 'Organiser area'], ['/admin', 'Admin login'], ['/privacy', 'Privacy']] as const) {
    await page.goto(path); await page.reload(); await expect(page.getByRole('heading', { name: text }).first()).toBeVisible()
  }
  await page.goto('/terms'); await expect(page.getByText('Vishnu Aravind')).toBeVisible(); await expect(page.getByText('66, Baroda Street, West Mambalam, Chennai')).toBeVisible()
})
