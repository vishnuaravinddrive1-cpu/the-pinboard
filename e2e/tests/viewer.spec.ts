import { expect, test } from '@playwright/test'
import { clickVisiblePoster, dismissHint, newTab, openBoard, stubExternal } from './helpers'

const firstPoster = (page: import('@playwright/test').Page) => page.getByTestId('poster').first()

test.describe('viewer board', () => {
  test('cork board, header logo at top right, tagline, footer', async ({ page }) => {
    await openBoard(page)
    const logo = page.getByRole('link', { name: 'The Curiosity Quotient' }).first()
    await expect(logo).toHaveAttribute('href', 'https://www.tcqindia.com')
    await expect(logo).toHaveAttribute('target', '_blank')
    await expect(logo).toHaveAttribute('rel', /noopener/)
    const box = await logo.boundingBox(); const vp = page.viewportSize()!
    expect(box!.x + box!.width).toBeGreaterThan(vp.width * 0.8); expect(box!.y).toBeLessThan(80)
    await expect(page.getByText("What's happening in Chennai")).toBeAttached()
    const bg = await page.getByTestId('board').evaluate((e) => getComputedStyle(e.parentElement!).backgroundColor)
    const [r, g, b] = bg.match(/\d+/g)!.map(Number); expect(r + g + b).toBeLessThan(200) // dark
    await page.getByTestId('board').evaluate((e) => e.scrollTo(0, e.scrollHeight))
    await expect(page.getByText('A free community service by')).toBeVisible()
    for (const l of ['Terms', 'Privacy', 'Report this poster', 'Organiser login']) await expect(page.getByRole('link', { name: l }).or(page.getByRole('button', { name: l }))).toBeVisible()
  })

  test('first-visit hint shows once and is remembered', async ({ page, isMobile }) => {
    await stubExternal(page); await page.goto('/')
    const hint = page.getByTestId('hint')
    await expect(hint).toContainText(isMobile ? 'Tap a poster to open it. Double-tap to book.' : 'Click a poster to open it. Double-click to book.')
    await hint.getByRole('button', { name: 'Got it' }).click()
    await expect(hint).toBeHidden(); await page.reload()
    await expect(page.getByTestId('poster').first()).toBeVisible(); await expect(page.getByTestId('hint')).toHaveCount(0)
  })

  test('single click/tap opens the enlarged view with title, date and buttons; Esc closes and keeps scroll + focus', async ({ page }) => {
    await openBoard(page)
    const board = page.getByTestId('board')
    await board.evaluate((e) => e.scrollTo(0, 300)); await page.waitForTimeout(150)
    const before = await board.evaluate((e) => e.scrollTop)
    const id = await clickVisiblePoster(page, 1)
    const dlg = page.getByRole('dialog')
    await expect(dlg).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/p/${id}$`))
    await expect(dlg.getByRole('heading')).toBeVisible()
    for (const n of ['Share', 'Google Calendar', 'Add to calendar (.ics)', 'Close']) await expect(dlg.getByRole('button', { name: n }).or(dlg.getByRole('link', { name: n }))).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dlg).toBeHidden(); await expect(page).toHaveURL(/\/$/)
    expect(await board.evaluate((e) => e.scrollTop)).toBe(before)
    await expect(page.locator(`[data-pid="${id}"]`)).toBeFocused()
  })

  test('browser back closes the view without leaving the site; Close button and cork tap also close', async ({ page }) => {
    await openBoard(page)
    await firstPoster(page).click({ force: true, position: { x: 30, y: 60 } })
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.goBack(); await expect(page.getByRole('dialog')).toBeHidden(); await expect(page).toHaveURL(/\/$/)
    await firstPoster(page).click({ force: true, position: { x: 30, y: 60 } })
    await page.getByRole('button', { name: 'Close' }).click(); await expect(page.getByRole('dialog')).toBeHidden()
    await firstPoster(page).click({ force: true, position: { x: 30, y: 60 } })
    await expect(page.getByRole('dialog')).toBeVisible(); await page.waitForTimeout(600)
    await page.mouse.click(3, page.viewportSize()!.height / 2) // cork beside the poster
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('share link /p/{id} opens the board with that poster enlarged; unknown id falls back to the board', async ({ page }) => {
    await openBoard(page, '/p/demo-003')
    await expect(page.getByRole('dialog')).toContainText('Tamil Short Film Screening')
    await page.goto('/p/does-not-exist'); await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('That event is no longer on the board.')).toBeVisible()
  })

  test('double-click/double-tap books in a new tab; single click does not', async ({ page, isMobile }) => {
    await openBoard(page)
    const target = page.locator('[data-pid="demo-002"]')
    await target.scrollIntoViewIfNeeded()
    const box = (await target.boundingBox())!
    const x = box.x + box.width * 0.5, y = box.y + box.height * 0.4
    const popupP = newTab(page)
    if (isMobile) { await page.touchscreen.tap(x, y); await page.waitForTimeout(80); await page.touchscreen.tap(x, y) }
    else await page.mouse.dblclick(x, y)
    await popupP
    await expect(page.getByRole('dialog')).toBeVisible() // enlarged view did not toggle closed
  })

  test('poster without a booking link: double-click shows a message, no tab, no Book button', async ({ page, isMobile }) => {
    await openBoard(page)
    const target = page.locator('[data-pid="demo-004"]'); await target.scrollIntoViewIfNeeded()
    const box = (await target.boundingBox())!; const x = box.x + box.width * 0.5, y = box.y + box.height * 0.4
    let popups = 0; page.context().on('page', () => popups++)
    if (isMobile) { await page.touchscreen.tap(x, y); await page.waitForTimeout(80); await page.touchscreen.tap(x, y) } else await page.mouse.dblclick(x, y)
    await expect(page.getByText('No booking link for this event.')).toBeVisible()
    expect(popups).toBe(0)
    await expect(page.getByRole('button', { name: 'Book now' })).toHaveCount(0)
  })

  test('Book now button opens the link and counts a click', async ({ page }) => {
    await openBoard(page, '/p/demo-002')
    await Promise.all([newTab(page), page.getByRole('button', { name: 'Book now' }).click()])
    const clicks = await page.evaluate(() => JSON.parse(localStorage.getItem('pinboard.demo.v3')!).posters.find((p: any) => p.id === 'demo-002').clicks)
    expect(clicks).toBe(3 + 1 * 2 + 1)
  })

  test('opening a poster counts one view', async ({ page }) => {
    await openBoard(page, '/p/demo-005')
    await expect(page.getByRole('dialog')).toBeVisible()
    const v = await page.evaluate(() => JSON.parse(localStorage.getItem('pinboard.demo.v3')!).posters.find((p: any) => p.id === 'demo-005').views)
    expect(v).toBe(20 + 4 * 7 + 1)
  })

  test('keyboard: Tab focuses posters (with lift), Enter opens, arrows browse, Esc returns focus', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard flow is for desktop')
    await openBoard(page)
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab') // logo link, then first poster (header order)
    const focused = page.locator('[data-pid]:focus')
    await expect(focused).toHaveClass(/raised/)
    const id = await focused.getAttribute('data-pid')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page).not.toHaveURL(new RegExp(`/p/${id}$`))
    await page.keyboard.press('ArrowLeft'); await expect(page).toHaveURL(new RegExp(`/p/${id}$`))
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator(`[data-pid="${id}"]`)).toBeFocused()
  })

  test('hover raises a poster after a short intent delay and releases on leave; sweeping does not flicker', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover is desktop only')
    await openBoard(page)
    const p = page.locator('[data-pid="demo-002"]'); const b = (await p.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await expect(p).toHaveClass(/raised/)
    await page.mouse.move(2, 400)
    await expect(p).not.toHaveClass(/raised/)
    // quick sweep across several posters: nothing should end up raised if the pointer never rests
    await page.mouse.move(100, 300); await page.mouse.move(1200, 300, { steps: 6 }); await page.mouse.move(2, 780)
    await page.waitForTimeout(200)
    expect(await page.locator('.poster.raised').count()).toBe(0)
  })

  test('scrolling the board under a stationary pointer raises the poster that arrives under it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover is desktop only')
    await openBoard(page)
    await page.mouse.move(640, 400); await page.waitForTimeout(250)
    const first = await page.locator('.poster.raised').getAttribute('data-pid')
    const under = () => page.evaluate(() => (document.elementFromPoint(640, 400) as HTMLElement | null)?.closest<HTMLElement>('[data-pid]')?.dataset.pid ?? null)
    let now: string | null = null
    for (let i = 0; i < 40 && (now === null || now === first); i++) { await page.mouse.wheel(0, 90); await page.waitForTimeout(160); now = await under() }
    expect(now).toBeTruthy(); expect(now).not.toBe(first)          // a different poster arrived under the still pointer
    await expect(page.locator(`[data-pid="${now}"]`)).toHaveClass(/raised/)
    await expect(page.locator('.poster.raised')).toHaveCount(1)
  })

  test('Outfit is the font everywhere on the board and in the viewer dialog', async ({ page }) => {
    await openBoard(page, '/p/demo-002')
    await page.evaluate(() => document.fonts.ready)
    const bad = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => {
      const el = e as HTMLElement; if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false
      if (el.tagName === 'IMG' || el.tagName === 'svg' || el.closest('svg')) return false
      return !getComputedStyle(el).fontFamily.toLowerCase().startsWith('outfit') }).map((e) => e.tagName + '.' + (e as HTMLElement).className).slice(0, 5))
    expect(bad).toEqual([])
    for (const w of [400, 600, 700]) expect(await page.evaluate((w) => document.fonts.check(`${w} 16px Outfit`), w)).toBe(true)
    const requested = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /fonts\.(googleapis|gstatic)/.test(n)))
    expect(requested).toEqual([]) // self-hosted
  })

  test('report dialog sends a report', async ({ page }) => {
    await openBoard(page, '/p/demo-002')
    await page.getByRole('dialog').getByRole('button', { name: 'Report' }).click()
    await page.getByLabel('What is wrong?').fill('This looks like a rally')
    await page.getByRole('button', { name: 'Send report' }).click()
    await expect(page.getByText('Thanks. The admin has been told.')).toBeVisible()
  })
})

test('midnight IST expiry: poster is on the board at 23:59:50 IST and gone at 00:00:10 IST', async ({ page }) => {
  await dismissHint(page); await stubExternal(page)
  await page.clock.setFixedTime(new Date('2026-11-25T18:29:50Z'))   // 23:59:50 IST on 25 Nov
  await page.goto('/'); await expect(page.getByTestId('poster').first()).toBeVisible()
  await expect(page.locator('[data-pid="demo-001"]')).toHaveCount(1)           // event date = 25 Nov
  await page.clock.setFixedTime(new Date('2026-11-25T18:30:10Z'))   // 00:00:10 IST on 26 Nov
  await page.reload(); await expect(page.getByTestId('poster').first()).toBeVisible()
  await expect(page.locator('[data-pid="demo-001"]')).toHaveCount(0)           // expired, never shown
  await expect(page.locator('[data-pid="demo-002"]')).toHaveCount(1)           // later events remain
})
