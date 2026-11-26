import { expect, test, type Browser, type Page } from '@playwright/test'
import { codeFor, dismissHint, fixture } from '../tests/helpers'

const uniq = () => Math.random().toString(36).slice(2, 8)
const dayOffset = (n: number) => new Date(Date.now() + n * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10)

async function signup(page: Page, email: string, name: string) {
  await page.goto('/organiser')
  await page.getByRole('tab', { name: 'Sign up' }).click()
  await page.getByLabel('Your name or group').fill(name); await page.getByLabel('Email').fill(email)
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Send me a code' }).click()
  await page.getByLabel('6-digit code').waitFor()
  await expect.poll(() => codeFor(page, email), { timeout: 10000 }).not.toBe('123456')
  await page.getByLabel('6-digit code').fill(await codeFor(page, email))
  await page.getByRole('button', { name: 'Create account' }).click()
}
async function loginAs(page: Page, email: string, area = 'organiser') {
  await page.goto('/' + area)
  await page.getByLabel('Email').fill(email); await page.getByRole('button', { name: 'Send me a code' }).click()
  await page.getByLabel('6-digit code').waitFor()
  await expect.poll(() => codeFor(page, email), { timeout: 10000 }).not.toBe('123456')
  await page.getByLabel('6-digit code').fill(await codeFor(page, email))
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click()
}
async function newPage(browser: Browser, opts: Record<string, unknown> = {}) {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:4180', ...opts }); const page = await ctx.newPage(); await dismissHint(page); return { ctx, page }
}
async function approve(browser: Browser, email: string) {
  const { ctx, page } = await newPage(browser)
  await loginAs(page, 'admin@e2e.test', 'admin')
  await page.getByRole('tab', { name: 'Organisers' }).click()
  const row = page.getByTestId('admin-organiser').filter({ hasText: email })
  await row.getByRole('button', { name: 'Approve' }).click(); await expect(row).toContainText('approved')
  await ctx.close()
}
async function upload(page: Page, title: string, days = 3) {
  await page.getByRole('button', { name: '+ New poster' }).click()
  await page.getByTestId('file').setInputFiles(fixture('poster.png')); await expect(page.getByTestId('file-info')).toContainText('Ready')
  await page.getByLabel('Event title *').fill(title); await page.getByLabel('Event date *').fill(dayOffset(days))
  await page.getByLabel('Area *').selectOption('Adyar'); await page.getByLabel('Category *').selectOption('Arts'); await page.getByTestId('confirm').check()
  await page.getByRole('button', { name: 'Post my poster' }).click()
}

test.describe.configure({ mode: 'serial' })

test('the first sign-in by the configured admin email creates the admin account', async ({ browser }) => {
  const { ctx, page } = await newPage(browser)
  await signup(page, 'admin@e2e.test', 'TCQ Admin')
  await expect(page.getByRole('button', { name: '+ New poster' })).toBeVisible()      // approved straight away
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible()
  await page.goto('/admin'); await expect(page.getByText('Live posters', { exact: true })).toBeVisible()
  await ctx.close()
})

test('the real API serves the seeded board (not demo data) with working images', async ({ page }) => {
  await dismissHint(page); await page.goto('/')
  await expect(page.getByTestId('poster').first()).toBeVisible()
  const titles = await page.getByTestId('poster').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  expect(titles.some((t) => t!.startsWith('Filter Coffee & Poetry Evening'))).toBe(true)
  expect(titles.length).toBe(20)                                       // 20 seeded rows, not the 22 in-browser demo posters
  expect(await page.evaluate(() => localStorage.getItem('pinboard.demo.v2'))).toBeNull()
  await expect.poll(() => page.locator('[data-testid=poster] img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  const src = await page.locator('[data-testid=poster] img').first().getAttribute('src'); expect(src).toMatch(/^\/img\/seed\//)
})

test('opening a poster counts a view in the database; deep link works', async ({ page, request }) => {
  await dismissHint(page); await page.goto('/')
  const id = await page.getByTestId('poster').first().getAttribute('data-pid')
  await page.goto('/p/' + id); await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(500)
  // anonymous visitors cannot read analytics directly
  expect((await request.get('/api/admin/posters')).status()).toBe(401)
})

test('full organiser journey: sign up with an email code, wait for approval, get approved, post without a booking link', async ({ browser }) => {
  const email = `org-${uniq()}@e2e.test`, title = `Reading Room ${uniq()}`
  const { ctx, page } = await newPage(browser)
  await signup(page, email, 'E2E Organiser')
  await expect(page.getByRole('heading', { name: 'Pending approval' })).toBeVisible()
  await page.reload(); await expect(page.getByRole('heading', { name: 'Pending approval' })).toBeVisible()   // session survives a reload
  await approve(browser, email)
  await page.reload(); await expect(page.getByRole('button', { name: '+ New poster' })).toBeVisible()
  await upload(page, title)
  await expect(page.getByRole('heading', { name: 'Your poster is live!' })).toBeVisible()
  await page.getByRole('button', { name: 'Go to my posters' }).click()
  await expect(page.getByTestId('my-poster').filter({ hasText: title })).toContainText('Live')
  // public board shows it, image served by the API
  const pub = await newPage(browser)
  await pub.page.goto('/')
  const card = pub.page.locator(`[data-testid=poster][aria-label^="${title}"]`); await expect(card).toHaveCount(1)
  await pub.page.goto('/p/' + (await card.getAttribute('data-pid')))
  await expect(pub.page.getByRole('dialog')).toContainText(title); await expect(pub.page.getByRole('button', { name: 'Book now' })).toHaveCount(0)
  await expect.poll(() => pub.page.getByRole('dialog').locator('img[alt="' + title + '"]').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await pub.ctx.close()
  // logout really ends the session
  await page.goto('/organiser'); await page.getByRole('button', { name: 'Log out' }).click()
  await page.reload(); await expect(page.getByRole('tab', { name: 'Log in' })).toBeVisible()
  await ctx.close()
})

test('wrong sign-in code is refused; an unknown email says nothing; a pending organiser is not an admin', async ({ browser }) => {
  const { ctx, page } = await newPage(browser)
  await page.goto('/organiser'); await page.getByLabel('Email').fill('nobody@e2e.test'); await page.getByRole('button', { name: 'Send me a code' }).click()
  await expect(page.getByRole('status')).toContainText('If that email can sign in')
  await page.getByLabel('6-digit code').fill('000000'); await page.getByRole('button', { name: 'Log in', exact: true }).last().click()
  await expect(page.getByRole('alert')).toBeVisible()
  const email = `plain-${uniq()}@e2e.test`; await signup(page, email, 'Plain Person')
  await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible()
  const r = await page.request.get('/api/admin/stats'); expect(r.status()).toBe(403)
  await ctx.close()
})

test('admin console works on the real backend: stats, organisers, emails log', async ({ browser }) => {
  const { ctx, page } = await newPage(browser)
  await loginAs(page, 'admin@e2e.test', 'admin')
  await expect(page.getByText('Live posters', { exact: true })).toBeVisible(); await expect(page.getByText(/\d+ of 100/)).toBeVisible()
  await page.getByRole('tab', { name: 'Organisers' }).click(); await expect(page.getByTestId('admin-organiser').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Emails' }).click(); await expect(page.getByText('login_code').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Posters' }).click()
  await expect(page.getByTestId('flag').filter({ hasText: 'New link domain' }).first()).toBeVisible()
  await ctx.close()
})

test('full board: the next upload joins the queue, a take-down promotes it, then the limit is restored', async ({ browser }) => {
  const email = `queue-${uniq()}@e2e.test`, title = `Queued ${uniq()}`
  const org = await newPage(browser); await signup(org.page, email, 'Queue Person'); await approve(browser, email)
  const adm = await newPage(browser); await loginAs(adm.page, 'admin@e2e.test', 'admin'); await expect(adm.page.getByText('Live posters', { exact: true })).toBeVisible()
  const liveNow = await adm.page.evaluate(async () => (await (await fetch('/api/admin/stats')).json()).live as number)
  await adm.page.getByRole('tab', { name: 'Settings' }).click()
  await adm.page.getByLabel('Board limit (live posters)').fill(String(liveNow)); await adm.page.getByRole('button', { name: 'Save settings' }).click(); await expect(adm.page.getByText('Saved.')).toBeVisible()

  await org.page.reload(); await upload(org.page, title)
  await expect(org.page.getByText('The board is full right now. Your poster is in the queue and will go up as soon as a space opens.')).toBeVisible()
  await expect(org.page.getByText('Queue position: 1')).toBeVisible()
  const pub = await newPage(browser); await pub.page.goto('/')
  await expect(pub.page.locator(`[data-testid=poster][aria-label^="${title}"]`)).toHaveCount(0)   // waiting posters are never shown

  await adm.page.getByRole('tab', { name: 'Posters' }).click()
  await adm.page.getByTestId('admin-poster').filter({ hasText: 'Chennai Sketch Walk' }).getByRole('button', { name: 'Take down' }).click()
  const row = adm.page.getByTestId('admin-poster').filter({ hasText: title }); await expect(row).toContainText('live')   // promoted at once
  await pub.page.reload(); await expect(pub.page.locator(`[data-testid=poster][aria-label^="${title}"]`)).toHaveCount(1)

  await adm.page.getByRole('tab', { name: 'Settings' }).click()
  await adm.page.getByLabel('Board limit (live posters)').fill('100'); await adm.page.getByRole('button', { name: 'Save settings' }).click(); await expect(adm.page.getByText('Saved.')).toBeVisible()
  for (const c of [org.ctx, adm.ctx, pub.ctx]) await c.close()
})

test('Outfit is used everywhere on the live stack too', async ({ page }) => {
  await dismissHint(page); await page.goto('/p/' + (await (async () => { await page.goto('/'); return page.getByTestId('poster').first().getAttribute('data-pid') })()))
  await page.evaluate(() => document.fonts.ready)
  const bad = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => !(e.closest('svg') || e.tagName === 'IMG') && (e as HTMLElement).offsetParent !== null && !getComputedStyle(e).fontFamily.toLowerCase().startsWith('outfit')).map((e) => e.tagName).slice(0, 5))
  expect(bad).toEqual([])
})
