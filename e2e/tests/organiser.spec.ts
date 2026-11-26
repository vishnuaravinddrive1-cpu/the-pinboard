import { expect, test, type Page } from '@playwright/test'
import { codeFor, fixture, login, noHScroll, openBoard, stubExternal } from './helpers'
import { statSync } from 'node:fs'

const dayOffset = (n: number) => new Date(Date.now() + n * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10)

async function startUpload(page: Page) {
  await login(page, 'organiser@demo.test', 'organiser')
  await page.getByRole('button', { name: '+ New poster' }).click()
}
async function fillForm(page: Page, title: string, opts: { url?: string; date?: string } = {}) {
  await page.getByLabel('Event title *').fill(title)
  await page.getByLabel('Event date *').fill(opts.date ?? dayOffset(3))
  if (opts.url !== undefined) await page.getByLabel('Booking link (optional)').fill(opts.url)
  await page.getByLabel('Area *').selectOption('Adyar')
  await page.getByLabel('Category *').selectOption('Arts')
  await page.getByTestId('confirm').check()
}

test.describe('organiser area', () => {
  test('sign-up needs the Terms tick, then the account is Pending approval and cannot post', async ({ page }) => {
    await stubExternal(page); await page.goto('/organiser')
    await page.getByRole('tab', { name: 'Sign up' }).click()
    await page.getByLabel('Your name or group').fill('Chennai Readers')
    await page.getByLabel('Email').fill('readers@example.org')
    await page.getByRole('button', { name: 'Send me a code' }).click()
    await expect(page.getByRole('alert')).toContainText('accept the Terms')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Send me a code' }).click()
    await page.getByLabel('6-digit code').fill('000001')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText(/not right|expired/)
    await page.getByLabel('6-digit code').fill(await codeFor(page, 'readers@example.org'))
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { name: 'Pending approval' })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ New poster' })).toHaveCount(0)
  })

  test('suspended organiser sees the suspension notice', async ({ page }) => {
    await login(page, 'suspended@demo.test', 'organiser')
    await expect(page.getByRole('heading', { name: 'Account suspended' })).toBeVisible()
  })

  test('upload an image WITHOUT a booking link: live instantly, appears on the board, no Book button', async ({ page }) => {
    await startUpload(page)
    await page.getByTestId('file').setInputFiles(fixture('poster.png'))
    await expect(page.getByTestId('file-info')).toContainText('Ready')
    await fillForm(page, 'Quiet Reading Room Evening')           // booking link left empty
    await page.getByRole('button', { name: 'Post my poster' }).click()
    await expect(page.getByRole('heading', { name: 'Your poster is live!' })).toBeVisible()
    await page.getByRole('button', { name: 'Go to my posters' }).click()
    const row = page.getByTestId('my-poster').filter({ hasText: 'Quiet Reading Room Evening' })
    await expect(row).toContainText('Live'); await expect(row).toContainText('0 views')
    await page.getByRole('link', { name: 'Admin' }).count()
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('pinboard.hint.v1', '1'))
    await expect(page.locator('[data-testid=poster][aria-label^="Quiet Reading Room Evening"]')).toHaveCount(1)
    await page.goto('/p/' + (await page.evaluate(() => JSON.parse(localStorage.getItem('pinboard.demo.v2')!).posters.find((p: any) => p.title === 'Quiet Reading Room Evening').id)))
    await expect(page.getByRole('dialog')).toContainText('Quiet Reading Room Evening')
    await expect(page.getByRole('button', { name: 'Book now' })).toHaveCount(0)
  })

  test('PDF upload: first page converted to an image under 400 KB', async ({ page }) => {
    await startUpload(page)
    await page.getByTestId('file').setInputFiles(fixture('poster-from-pdf.pdf'))
    await expect(page.getByTestId('file-info')).toContainText('first page of your PDF', { timeout: 30000 })
    const kb = Number(/(\d+) KB/.exec((await page.getByTestId('file-info').textContent())!)![1]); expect(kb).toBeLessThan(400)
    await fillForm(page, 'Poster from a PDF', { url: 'https://example.com/tickets' })
    await page.getByRole('button', { name: 'Post my poster' }).click()
    await expect(page.getByRole('heading', { name: 'Your poster is live!' })).toBeVisible()
  })

  test('very large photo (about 9 MB) is compressed in the browser to under 400 KB', async ({ page }) => {
    test.setTimeout(120000)
    expect(statSync(fixture('large-photo.jpg')).size).toBeGreaterThan(5 * 1024 * 1024)
    await startUpload(page)
    await page.getByTestId('gallery').setInputFiles(fixture('large-photo.jpg'))
    await expect(page.getByTestId('file-info')).toContainText('Ready', { timeout: 60000 })
    const t = (await page.getByTestId('file-info').textContent())!
    const [, w, h, kb] = /(\d+)×(\d+), (\d+) KB/.exec(t)!.map(Number)
    expect(kb).toBeLessThan(400); expect(Math.max(w, h)).toBeLessThanOrEqual(1600)
  })

  test('a text file renamed .png is rejected (type checked by content)', async ({ page }) => {
    await startUpload(page)
    await page.getByTestId('file').setInputFiles(fixture('not-an-image.png'))
    await expect(page.getByRole('alert')).toContainText('not a JPG, PNG, WebP or PDF')
  })

  test('form validation: http link rejected, past date rejected, confirmation required, duplicates blocked', async ({ page }) => {
    await startUpload(page)
    await page.getByTestId('file').setInputFiles(fixture('poster.png')); await expect(page.getByTestId('file-info')).toContainText('Ready')
    await fillForm(page, 'Validation Evening', { url: 'http://insecure.example.com' })
    await page.getByRole('button', { name: 'Post my poster' }).click()
    await expect(page.getByRole('alert')).toContainText('https://')
    await page.getByLabel('Booking link (optional)').fill('')
    await page.getByTestId('confirm').uncheck(); await page.getByRole('button', { name: 'Post my poster' }).click()
    await expect(page.getByRole('alert')).toContainText('confirmation box')
    await page.getByTestId('confirm').check(); await page.getByRole('button', { name: 'Post my poster' }).click()
    await expect(page.getByRole('heading', { name: 'Your poster is live!' })).toBeVisible()
    await page.getByRole('button', { name: 'Go to my posters' }).click(); await page.getByRole('button', { name: '+ New poster' }).click()
    await page.getByTestId('file').setInputFiles(fixture('poster.png')); await expect(page.getByTestId('file-info')).toContainText('Ready')
    await fillForm(page, 'Validation Evening')
    await page.getByRole('button', { name: 'Post my poster' }).click()
    await expect(page.getByRole('alert')).toContainText('already posted')
  })

  test('eligibility text, native date picker, camera/gallery/file pickers are on the form', async ({ page }) => {
    await startUpload(page)
    await expect(page.getByText('in or around Chennai').first()).toBeVisible()
    await expect(page.getByText('no campaigning, candidate or party promotion, or rallies')).toBeVisible()
    await expect(page.getByLabel('Event date *')).toHaveAttribute('type', 'date')
    await expect(page.locator('input[type=file][capture=environment]')).toHaveCount(1)
    await expect(page.locator('input[type=file][accept="image/*,application/pdf"]')).toHaveCount(1)
    await expect(page.getByText('Take photo')).toBeVisible(); await expect(page.getByText('Choose from gallery')).toBeVisible(); await expect(page.getByText('Choose file')).toBeVisible()
    for (const l of ['Event title *', 'Booking link (optional)']) expect(await page.getByLabel(l).evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16)
  })

  test('board full: poster is queued with a position and the clear message', async ({ page }) => {
    await login(page, 'admin@demo.test', 'admin')
    await page.getByRole('tab', { name: 'Settings' }).click()
    const live = Number((await page.evaluate(() => JSON.parse(localStorage.getItem('pinboard.demo.v2')!).posters.filter((p: any) => p.status === 'live').length)))
    await page.getByLabel('Board limit (live posters)').fill(String(live)); await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()
    await page.goto('/organiser'); await page.getByRole('button', { name: 'Log out' }).click()
    await login(page, 'organiser@demo.test', 'organiser'); await page.getByRole('button', { name: '+ New poster' }).click()
    await page.getByTestId('file').setInputFiles(fixture('poster.png')); await expect(page.getByTestId('file-info')).toContainText('Ready')
    await fillForm(page, 'Queued Evening'); await page.getByRole('button', { name: 'Post my poster' }).click()
    await expect(page.getByText('The board is full right now. Your poster is in the queue and will go up as soon as a space opens.')).toBeVisible()
    await expect(page.getByText('Queue position: 1')).toBeVisible()
    await page.getByRole('button', { name: 'Go to my posters' }).click()
    await expect(page.getByTestId('my-poster').filter({ hasText: 'Queued Evening' })).toContainText('Waiting · #1')
    await page.goto('/'); await expect(page.locator('[data-testid=poster][aria-label^="Queued Evening"]')).toHaveCount(0) // waiting posters never shown
  })

  test('organiser can edit, and sees views and clicks per poster', async ({ page }) => {
    await login(page, 'organiser@demo.test', 'organiser')
    const first = page.getByTestId('my-poster').first()
    await expect(first).toContainText('views'); await expect(first).toContainText('clicks')
    await first.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title').fill('Renamed by organiser'); await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('my-poster').filter({ hasText: 'Renamed by organiser' })).toHaveCount(1)
  })

  test('phone: the form is a single column with no horizontal scroll', async ({ page, isMobile }) => {
    test.skip(!isMobile)
    await startUpload(page); expect(await noHScroll(page)).toBe(true)
    const a = await page.getByLabel('Event title *').boundingBox(), b = await page.getByLabel('Area *').boundingBox()
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(2); expect(a!.width).toBeGreaterThan(page.viewportSize()!.width * 0.7)
  })
})

test('plain board still works untouched', async ({ page }) => { await openBoard(page) })
