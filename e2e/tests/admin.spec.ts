import { expect, test } from '@playwright/test'
import { login, noHScroll } from './helpers'

test.describe('admin console', () => {
  test('organisers cannot use /admin (role enforced; demo mirrors the server rule)', async ({ page }) => {
    await login(page, 'organiser@demo.test', 'admin')
    await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible()
  })

  test('dashboard shows the stats cards', async ({ page }) => {
    await login(page, 'admin@demo.test', 'admin')
    for (const l of ['Live posters', 'Waiting queue', 'Past (archived)', 'Pending organisers', 'Total views', 'Booking clicks', 'Storage used', 'Emails today']) await expect(page.getByText(l, { exact: true })).toBeVisible()
    await expect(page.getByText(/\d+ of 100/)).toBeVisible()
    await expect(page.getByText('Top categories')).toBeVisible(); await expect(page.getByText('Events per week')).toBeVisible()
    await expect(page.locator('svg[role=img]')).toHaveCount(2)
  })

  test('approve a pending organiser: status changes, activity logged, email recorded', async ({ page }) => {
    await login(page, 'admin@demo.test', 'admin')
    await page.getByRole('tab', { name: 'Organisers' }).click()
    const row = page.getByTestId('admin-organiser').filter({ hasText: 'newbie@demo.test' })
    await expect(row).toContainText('pending')
    await row.getByRole('button', { name: 'Approve' }).click()
    await expect(row).toContainText('approved')
    await page.getByRole('tab', { name: 'Emails' }).click(); await expect(page.getByText('organiser_approved', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Activity' }).click(); await expect(page.getByText('organiser_approved', { exact: true })).toBeVisible()
  })

  test('suspend and reinstate an organiser (dialog asks for a reason)', async ({ page }) => {
    await login(page, 'admin@demo.test', 'admin'); await page.getByRole('tab', { name: 'Organisers' }).click()
    page.on('dialog', (d) => d.accept('spam'))
    const row = page.getByTestId('admin-organiser').filter({ hasText: 'organiser@demo.test' })
    await row.getByRole('button', { name: 'Suspend' }).click(); await expect(row).toContainText('suspended')
    await row.getByRole('button', { name: 'Reinstate' }).click(); await expect(row).toContainText('approved')
  })

  test('review flags, take down, restore, extend, out-of-scope, delete', async ({ page }) => {
    await login(page, 'admin@demo.test', 'admin'); await page.getByRole('tab', { name: 'Posters' }).click()
    await expect(page.getByTestId('flag').filter({ hasText: 'Category: Other' }).first()).toBeVisible()
    await expect(page.getByTestId('flag').filter({ hasText: 'Area: other' }).first()).toBeVisible()
    await expect(page.getByTestId('flag').filter({ hasText: 'New link domain' }).first()).toBeVisible()
    const row = page.getByTestId('admin-poster').filter({ hasText: 'Board Games Meetup' })
    await row.getByRole('button', { name: 'Take down' }).click(); await expect(row).toContainText('taken down')
    await row.getByRole('button', { name: 'Restore' }).click(); await expect(row).toContainText('live')
    await row.getByRole('button', { name: 'Extend +7d' }).click()
    page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Not a Chennai event' : undefined))
    await row.getByRole('button', { name: 'Out of scope' }).click(); await expect(row).toContainText('taken down'); await expect(row).toContainText('Not a Chennai event')
    await page.getByRole('tab', { name: 'Emails' }).click(); await expect(page.getByText('poster_out_of_scope')).toBeVisible()
    await page.getByRole('tab', { name: 'Posters' }).click()
    await page.getByTestId('admin-poster').filter({ hasText: 'Board Games Meetup' }).getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByTestId('admin-poster').filter({ hasText: 'Board Games Meetup' })).toHaveCount(0)
  })

  test('search, filter and CSV export', async ({ page, isMobile }) => {
    await login(page, 'admin@demo.test', 'admin'); await page.getByRole('tab', { name: 'Posters' }).click()
    if (isMobile) await page.getByText('Search and filters').click()
    await page.locator(isMobile ? 'details input[type=search]' : 'input[type=search]').fill('pottery')
    await expect(page.getByTestId('admin-poster')).toHaveCount(1)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
    expect(dl.suggestedFilename()).toBe('events.csv')
  })

  test('queue: full board queues a poster, take-down promotes it at once, admin can promote/reorder', async ({ page }) => {
    await login(page, 'admin@demo.test', 'admin'); await page.getByRole('tab', { name: 'Settings' }).click()
    const live = await page.evaluate(() => JSON.parse(localStorage.getItem('pinboard.demo.v2')!).posters.filter((p: any) => p.status === 'live').length)
    await page.getByLabel('Board limit (live posters)').fill(String(live)); await page.getByRole('button', { name: 'Save settings' }).click(); await expect(page.getByText('Saved.')).toBeVisible()
    // add two waiting posters straight into the demo store (the organiser upload path is covered in organiser.spec)
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('pinboard.demo.v2')!); const base = s.posters[0]
      for (const [i, t] of ['Queue A', 'Queue B'].entries()) s.posters.push({ ...base, id: 'q' + i, title: t, status: 'waiting', queue_position: i + 1, created_at: new Date(Date.now() + i).toISOString() })
      localStorage.setItem('pinboard.demo.v2', JSON.stringify(s))
    })
    await page.reload(); await page.getByRole('tab', { name: 'Posters' }).click()
    const a = page.getByTestId('admin-poster').filter({ hasText: 'Queue A' }), b = page.getByTestId('admin-poster').filter({ hasText: 'Queue B' })
    await expect(a).toContainText('waiting #1'); await expect(b).toContainText('waiting #2')
    await b.getByRole('button', { name: 'Move up in queue' }).click(); await expect(b).toContainText('waiting #1'); await expect(a).toContainText('waiting #2')
    await b.getByRole('button', { name: 'Promote now' }).click(); await expect(page.getByRole('alert')).toContainText('board is full')
    await page.getByTestId('admin-poster').filter({ hasText: 'Chennai Sketch Walk' }).getByRole('button', { name: 'Take down' }).click()
    await expect(b).toContainText('live')     // promoted immediately, first in the queue
    await expect(a).toContainText('waiting #1')
  })

  test('settings page saves', async ({ page }) => {
    await login(page, 'admin@demo.test', 'admin'); await page.getByRole('tab', { name: 'Settings' }).click()
    for (const l of ['Board limit (live posters)', 'Reminder lead time (days before the event)', 'Admin email', 'Current Terms version', 'Archive retention (years)', 'Allowed categories (one per line)', 'Allowed areas (one per line)']) await expect(page.getByLabel(l)).toBeVisible()
    await page.getByLabel('Reminder lead time (days before the event)').fill('2'); await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()
  })

  test('phone: no horizontal scroll, action buttons are at least 44px tall', async ({ page, isMobile }) => {
    test.skip(!isMobile)
    await login(page, 'admin@demo.test', 'admin'); await page.getByRole('tab', { name: 'Posters' }).click()
    expect(await noHScroll(page)).toBe(true)
    const heights = await page.getByTestId('admin-poster').first().getByRole('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(43.5)
  })
})
