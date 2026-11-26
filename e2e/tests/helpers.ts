import { expect, type Page } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const fixture = (n: string) => join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n)

export async function stubExternal(page: Page) {
  await page.context().route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Booking page</h1>' }))
  await page.context().route('https://calendar.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'calendar' }))
}
export async function dismissHint(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('pinboard.hint.v1', '1') } catch { /* */ } })
}
export async function openBoard(page: Page, path = '/') {
  await dismissHint(page); await stubExternal(page)
  await page.goto(path)
  await expect(page.getByTestId('poster').first()).toBeVisible()
}
/** Reads the sign-in code: in the full-stack test server it comes from the fake mailbox, in demo mode it is always 123456. */
export async function codeFor(page: Page, email: string): Promise<string> {
  try {
    const r = await page.request.get('/__test/code?email=' + encodeURIComponent(email))
    if ((r.headers()['content-type'] ?? '').includes('json')) { const j = await r.json(); if (j.code) return j.code }
  } catch { /* demo mode */ }
  return '123456'
}
export async function login(page: Page, email: string, area: 'organiser' | 'admin') {
  await stubExternal(page)
  await page.goto('/' + area)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send me a code' }).click()
  await page.getByLabel('6-digit code').waitFor()
  await page.getByLabel('6-digit code').fill(await codeFor(page, email))
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click()
}
export const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1)

/** Opens a new tab? (window.open with noopener does not raise Playwright's 'popup' event, so listen on the context.) */
export const newTab = (page: Page) => page.context().waitForEvent('page', { timeout: 5000 })
/** Click the visible poster whose centre is closest to the middle of the viewport (never scrolls the board). */
export async function clickVisiblePoster(page: Page, nth = 0) {
  const pt = await page.evaluate((nth) => {
    const vh = window.innerHeight, vw = window.innerWidth
    const items = [...document.querySelectorAll<HTMLElement>('[data-pid]')].map((el) => {
      const r = el.getBoundingClientRect(); return { id: el.dataset.pid!, x: r.x + r.width / 2, y: r.y + r.height * 0.6, ok: r.y > 90 && r.y + r.height * 0.6 < vh - 120 && r.x > 20 && r.x < vw - 20 }
    }).filter((i) => i.ok)
    return items[nth] ?? items[0]
  }, nth)
  await page.mouse.click(pt.x, pt.y)
  return pt.id
}
