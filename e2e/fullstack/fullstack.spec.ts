import { expect, test, type Browser, type Page } from '@playwright/test'
import { dismissHint, fixture } from '../tests/helpers'

const uniq = () => Math.random().toString(36).slice(2, 8)
const dayOffset = (n: number) => new Date(Date.now() + n * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10)

async function newPage(browser: Browser, opts: Record<string, unknown> = {}) {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:4180', ...opts }); const page = await ctx.newPage(); await dismissHint(page); return { ctx, page }
}
/** Opens the personal sign-in link of an existing account (test-only endpoint mints it; real life: the admin's email). */
async function signInAs(page: Page, email: string, approve = true) {
  const r = await page.request.get(`/__test/link?email=${encodeURIComponent(email)}${approve ? '&approve=1' : ''}`)
  const { url } = await r.json(); await page.goto(new URL(url).pathname + new URL(url).search)
}
async function adminPage(browser: Browser) {
  const x = await newPage(browser); await signInAs(x.page, 'admin@e2e.test', false)
  await expect(x.page.getByRole('link', { name: 'Admin' })).toBeVisible()        // wait until the link has signed us in
  await x.page.goto('/admin')
  await expect(x.page.getByText('Live posters', { exact: true })).toBeVisible(); return x
}
async function upload(page: Page, title: string, days = 3) {
  await page.getByRole('button', { name: '+ New poster' }).click()
  await page.getByTestId('file').setInputFiles(fixture('poster.png')); await expect(page.getByTestId('file-info')).toContainText('Ready')
  await page.getByLabel('Event title *').fill(title); await page.getByLabel('Event date *').fill(dayOffset(days))
  await page.getByLabel('Area *').selectOption('Adyar'); await page.getByLabel('Category *').selectOption('Arts'); await page.getByTestId('confirm').check()
  await page.getByRole('button', { name: 'Post my poster' }).click()
}

test.describe.configure({ mode: 'serial' })

test('first-time admin set-up: the secret key makes the admin and shows a personal sign-in link; it works only once', async ({ browser }) => {
  const { ctx, page } = await newPage(browser)
  await page.goto('/organiser?setup=wrong-key'); await expect(page.getByRole('alert')).toContainText('not right')
  const key = (await (await page.request.get('/__test/setup-key')).json()).key
  await page.goto('/organiser?setup=' + key)
  await expect(page.getByText('You are the admin. Save your sign-in link.')).toBeVisible()
  const link = (await page.getByTestId('admin-link').textContent())!; expect(link).toContain('/organiser?link=')
  expect(page.url()).not.toContain('setup=')                                           // the key is removed from the address bar
  await page.getByRole('button', { name: 'I have saved it' }).click()
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible()
  await page.goto('/admin'); await expect(page.getByText('Live posters', { exact: true })).toBeVisible()
  const other = await newPage(browser); await other.page.goto('/organiser?setup=' + key); await expect(other.page.getByRole('alert')).toContainText('already exists')
  const phone = await newPage(browser); await phone.page.goto(new URL(link).pathname + new URL(link).search)   // the saved link signs in on another device
  await expect(phone.page.getByRole('link', { name: 'Admin' })).toBeVisible()
  expect(phone.page.url()).not.toContain('link=')
  for (const c of [ctx, other.ctx, phone.ctx]) await c.close()
})

test('the real API serves the seeded board (not demo data) with working images', async ({ page }) => {
  await dismissHint(page); await page.goto('/')
  await expect(page.getByTestId('poster').first()).toBeVisible()
  const titles = await page.getByTestId('poster').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  expect(titles.some((t) => t!.startsWith('Filter Coffee & Poetry Evening'))).toBe(true)
  expect(titles.length).toBe(20)
  expect(await page.evaluate(() => localStorage.getItem('pinboard.demo.v3'))).toBeNull()
  await expect.poll(() => page.locator('[data-testid=poster] img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  expect(await page.locator('[data-testid=poster] img').first().getAttribute('src')).toMatch(/^\/img\/seed\//)
})

test('opening a poster by deep link works; anonymous visitors cannot read admin data', async ({ page, request }) => {
  await dismissHint(page); await page.goto('/')
  const id = await page.getByTestId('poster').first().getAttribute('data-pid')
  await page.goto('/p/' + id); await expect(page.getByRole('dialog')).toBeVisible()
  expect((await request.get('/api/admin/posters')).status()).toBe(401)
})

test('full organiser journey: request access, admin approves, copies the email from the Outbox, organiser signs in with the link and posts', async ({ browser }) => {
  const email = `org-${uniq()}@e2e.test`, title = `Reading Room ${uniq()}`
  const org = await newPage(browser)
  await org.page.goto('/organiser'); await org.page.getByRole('tab', { name: 'Request access' }).click()
  await org.page.getByLabel('Your name or group').fill('E2E Organiser'); await org.page.getByLabel('Email').fill(email)
  await org.page.getByRole('checkbox').check(); await org.page.getByRole('button', { name: 'Request access' }).click()
  await expect(org.page.getByRole('status')).toContainText('Thank you')
  await expect(org.page.getByRole('tab', { name: 'Log in' })).toBeVisible()                // not signed in

  const adm = await adminPage(browser)
  await expect(adm.page.getByTestId('attention')).toContainText('waiting for approval')
  await adm.page.getByRole('tab', { name: 'Organisers' }).click()
  const row = adm.page.getByTestId('admin-organiser').filter({ hasText: email })
  await expect(row).toContainText('pending')
  await row.getByRole('button', { name: 'Approve' }).click(); await expect(row).toContainText('approved')
  await adm.page.getByRole('tab', { name: /Outbox/ }).click()
  const mail = adm.page.getByTestId('outbox-item').filter({ hasText: email })
  await expect(mail.getByTestId('outbox-subject')).toHaveText('You are approved to post on Pin Board')
  const body = (await mail.getByTestId('outbox-body').textContent())!
  expect(body).toMatch(/^Hi E2E Organiser,/); expect(body).toContain('Warm regards,')
  const link = /(http\S+\/organiser\?link=\S+)/.exec(body)![1]
  await mail.getByRole('button', { name: 'Mark as sent' }).click(); await expect(mail).toHaveCount(0)

  // the organiser opens the link from the email
  await org.page.goto(new URL(link).pathname + new URL(link).search)
  await expect(org.page.getByRole('button', { name: '+ New poster' })).toBeVisible()
  expect(org.page.url()).not.toContain('link=')
  await org.page.reload(); await expect(org.page.getByRole('button', { name: '+ New poster' })).toBeVisible()        // session persists
  await upload(org.page, title)
  await expect(org.page.getByRole('heading', { name: 'Your poster is live!' })).toBeVisible()
  await org.page.getByRole('button', { name: 'Go to my posters' }).click()
  await expect(org.page.getByTestId('my-poster').filter({ hasText: title })).toContainText('Live')

  const pub = await newPage(browser); await pub.page.goto('/')
  const card = pub.page.locator(`[data-testid=poster][aria-label^="${title}"]`); await expect(card).toHaveCount(1)
  await pub.page.goto('/p/' + (await card.getAttribute('data-pid')))
  await expect(pub.page.getByRole('dialog')).toContainText(title); await expect(pub.page.getByRole('button', { name: 'Book now' })).toHaveCount(0)
  await expect.poll(() => pub.page.getByRole('dialog').locator('img[alt="' + title + '"]').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)

  await org.page.goto('/organiser'); await org.page.getByRole('button', { name: 'Log out' }).click()
  await org.page.reload(); await expect(org.page.getByRole('tab', { name: 'Log in' })).toBeVisible()
  // lost link: the approved organiser asks for a new one; it shows up in the admin's outbox
  await org.page.getByRole('button', { name: 'Lost your link?' }).click()
  await org.page.getByLabel('Your email').fill(email); await org.page.getByRole('button', { name: 'Ask for a new link' }).click()
  await expect(org.page.getByRole('status')).toContainText('If that email belongs to an approved organiser')
  await adm.page.getByRole('tab', { name: 'Dashboard' }).click(); await adm.page.getByRole('tab', { name: /Outbox/ }).click()
  await expect(adm.page.getByTestId('outbox-item').filter({ hasText: 'login link' }).filter({ hasText: email })).toHaveCount(1)
  for (const c of [org.ctx, adm.ctx, pub.ctx]) await c.close()
})

test('a bad sign-in link is refused with a clear message; a pending organiser cannot post or reach /admin', async ({ browser }) => {
  const { ctx, page } = await newPage(browser)
  await page.goto('/organiser?link=' + 'x'.repeat(43)); await expect(page.getByRole('alert')).toContainText('not valid')
  await signInAs(page, `pending-${uniq()}@e2e.test`, false)
  await expect(page.getByRole('heading', { name: 'Pending approval' })).toBeVisible()
  await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible()
  expect((await page.request.get('/api/admin/stats')).status()).toBe(403)
  await ctx.close()
})

test('admin console works on the real backend: stats, organisers, outbox, flags', async ({ browser }) => {
  const adm = await adminPage(browser)
  await expect(adm.page.getByText(/\d+ of 100/)).toBeVisible()
  await adm.page.getByRole('tab', { name: 'Organisers' }).click(); await expect(adm.page.getByTestId('admin-organiser').first()).toBeVisible()
  await adm.page.getByRole('tab', { name: /Outbox/ }).click()
  await adm.page.getByRole('tab', { name: 'Sent' }).click(); await expect(adm.page.getByTestId('outbox-item').first()).toBeVisible()
  await adm.page.getByRole('tab', { name: 'Posters' }).click()
  await expect(adm.page.getByTestId('flag').filter({ hasText: 'New link domain' }).first()).toBeVisible()
  await adm.ctx.close()
})

test('full board: the next upload joins the queue, a take-down promotes it, the promoted email is in the outbox, then the limit is restored', async ({ browser }) => {
  const email = `queue-${uniq()}@e2e.test`, title = `Queued ${uniq()}`
  const org = await newPage(browser); await signInAs(org.page, email)
  const adm = await adminPage(browser)
  const liveNow = await adm.page.evaluate(async () => (await (await fetch('/api/admin/stats')).json()).live as number)
  await adm.page.getByRole('tab', { name: 'Settings' }).click()
  await adm.page.getByLabel('Board limit (live posters)').fill(String(liveNow)); await adm.page.getByRole('button', { name: 'Save settings' }).click(); await expect(adm.page.getByText('Saved.')).toBeVisible()

  await upload(org.page, title)
  await expect(org.page.getByText('The board is full right now. Your poster is in the queue and will go up as soon as a space opens.')).toBeVisible()
  await expect(org.page.getByText('Queue position: 1')).toBeVisible()
  const pub = await newPage(browser); await pub.page.goto('/')
  await expect(pub.page.locator(`[data-testid=poster][aria-label^="${title}"]`)).toHaveCount(0)

  await adm.page.getByRole('tab', { name: 'Posters' }).click()
  await adm.page.getByTestId('admin-poster').filter({ hasText: 'Chennai Sketch Walk' }).getByRole('button', { name: 'Take down' }).click()
  await expect(adm.page.getByTestId('admin-poster').filter({ hasText: title })).toContainText('live')
  await pub.page.reload(); await expect(pub.page.locator(`[data-testid=poster][aria-label^="${title}"]`)).toHaveCount(1)
  await adm.page.getByRole('tab', { name: /Outbox/ }).click()
  const m = adm.page.getByTestId('outbox-item').filter({ hasText: email }).filter({ hasText: 'poster promoted' })
  await expect(m.getByTestId('outbox-body')).toContainText(`"${title}"`)

  await adm.page.getByRole('tab', { name: 'Settings' }).click()
  await adm.page.getByLabel('Board limit (live posters)').fill('100'); await adm.page.getByRole('button', { name: 'Save settings' }).click(); await expect(adm.page.getByText('Saved.')).toBeVisible()
  for (const c of [org.ctx, adm.ctx, pub.ctx]) await c.close()
})

test('Outfit is used everywhere on the live stack too', async ({ page }) => {
  await dismissHint(page); await page.goto('/')
  const id = await page.getByTestId('poster').first().getAttribute('data-pid')
  await page.goto('/p/' + id); await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const bad = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => !(e.closest('svg') || e.tagName === 'IMG') && (e as HTMLElement).offsetParent !== null && !getComputedStyle(e).fontFamily.toLowerCase().startsWith('outfit')).map((e) => e.tagName).slice(0, 5))
  expect(bad).toEqual([])
})
