// Availability and new reservations (spec: docs/specs/stage-1-availability-and-reservations.md), on
// the demo group: Chiamaka takes a phone booking by keyboard with a discount within her limit and
// finds it again; two desks race for the last Junior Suite; offline, New reservation waits for a
// connection; the owner sees every hotel's bookings with a Hotel column. Desktop and phone.
import { expect, type Page, test } from '@playwright/test'
import { seedDemoGroup, signIn } from './support'

const PASSWORD = 'Demo-pass-42!'

// The seed's business date: today in Lagos (seed/demo.ts).
const lagosToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

async function openSheet(page: Page, arrival: string, departure: string) {
  await page.goto('/reservations')
  await page.getByRole('heading', { name: 'Reservations', level: 1 }).waitFor()
  await page.keyboard.press('n')
  const sheet = page.getByRole('dialog', { name: 'New reservation' })
  await sheet.getByLabel('Arrival').fill(arrival)
  await sheet.getByLabel('Departure').fill(departure)
  await sheet.getByLabel('Adults').fill('1')
  await sheet.getByLabel('Adults').press('Enter')
  await expect(sheet.getByText('Left per night').first()).toBeVisible()
  return sheet
}

async function pick(page: Page, type: string, plan: RegExp) {
  const sheet = page.getByRole('dialog', { name: 'New reservation' })
  const show = sheet.getByRole('button', { name: new RegExp(`plans? for ${type}$`) })
  if (await show.isVisible()) await show.click()
  await sheet.getByRole('radio', { name: plan }).check()
  await expect(sheet.getByText(/total for the stay/).first()).toBeVisible()
}

async function guest(page: Page, first: string, last: string, phone: string) {
  const sheet = page.getByRole('dialog', { name: 'New reservation' })
  // With two desks open, a window-focus refresh of the quote can be in flight; Continue then
  // answers "Checking the price. One moment." and stays on the step, so click again until it moves.
  await expect(async () => {
    await sheet.getByRole('button', { name: 'Continue to guest' }).click()
    await expect(sheet.getByLabel('First name')).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await sheet.getByLabel('First name').fill(first)
  await sheet.getByLabel('Last name').fill(last)
  await sheet.getByRole('textbox', { name: 'Phone', exact: true }).fill(phone)
  await sheet.getByRole('button', { name: 'Continue to review' }).click()
  await expect(sheet.getByRole('heading', { name: 'Review & book' })).toBeVisible()
}

test('front desk takes a phone booking with a discount within her limit, and finds it again', async ({
  page,
}, testInfo) => {
  const domain = seedDemoGroup(`res-book-${testInfo.project.name}`, PASSWORD)
  await signIn(page, `chiamaka@${domain}`, PASSWORD)
  await page.getByRole('heading', { name: /^Good/ }).waitFor()
  const today = lagosToday()
  const sheet = await openSheet(page, plusDays(today, 12), plusDays(today, 15))
  await pick(page, 'Deluxe King', /^Bed & breakfast/)

  await sheet.getByRole('button', { name: 'Change rate' }).click()
  await sheet.getByLabel('Discount', { exact: true }).fill('15')
  await sheet.getByText('Repeat guest').click()
  await expect(
    sheet.getByText('15% is over your 12% discount limit.', { exact: false }),
  ).toBeVisible()
  // Continue says why it can't go on.
  await sheet.getByRole('button', { name: /^Continue to guest/ }).click()
  await expect(sheet.getByRole('alert').filter({ hasText: 'discount limit' }).first()).toBeVisible()
  await expect(sheet.getByLabel('Find a guest')).toHaveCount(0)
  await sheet.getByLabel('Discount', { exact: true }).fill('10')
  await expect(
    sheet.getByText(/₦168,000\.00 → ₦151,200\.00 a night · 10% off Bed & breakfast/),
  ).toBeVisible()

  await sheet.getByRole('button', { name: 'Continue to guest' }).click()
  await sheet.getByLabel('Find a guest').fill('Collins')
  await expect(sheet.getByText('No guest matches “Collins”. Add them below.')).toBeVisible()
  await sheet.getByLabel('First name').fill('Sarah')
  await sheet.getByLabel('Last name').fill('Collins')
  await sheet.getByRole('textbox', { name: 'Phone', exact: true }).fill('+44 7700 900123')
  await sheet.getByRole('combobox', { name: 'Nationality' }).fill('British')
  await sheet.getByRole('option', { name: 'British (United Kingdom)' }).click()
  await sheet.getByRole('button', { name: 'Continue to review' }).click()
  await expect(sheet.getByText(/≈ £/).first()).toBeVisible()
  await expect(sheet.getByText('10% off Bed & breakfast', { exact: false })).toBeVisible()
  // ⌘↵ books from the keyboard.
  await sheet.getByRole('button', { name: /^Book · ₦555,660\.00/ }).press('Control+Enter')

  await expect(page.getByRole('heading', { name: 'Sarah Collins' })).toBeVisible()
  await expect(page.getByText(/^Booked VI-\d{4}-\d{4} for Sarah Collins$/)).toBeVisible()
  await expect(
    page.getByText('Plan price ₦168,000.00 · 10% discount', { exact: false }),
  ).toBeVisible()
  const number =
    (
      await page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByText(/^VI-\d{4}-\d{4}$/)
        .textContent()
    )?.trim() ?? ''

  for (const q of ['collins', number.slice(-4), '+44 7700']) {
    await page.goto(`/reservations?view=all&q=${encodeURIComponent(q)}`)
    await expect(page.getByRole('link', { name: 'Sarah Collins' })).toBeVisible()
  }
})

test('two desks race for the last Junior Suite: one books, the other is told it was just sold', async ({
  browser,
}, testInfo) => {
  // Two people signing in and walking the sheet side by side takes a while.
  test.setTimeout(90_000)
  const domain = seedDemoGroup(`res-race-${testInfo.project.name}`, PASSWORD)
  const today = lagosToday()
  // The wedding leaves 1 of 8 Junior Suites on D+15 (seed/reservations.ts).
  const desks = await Promise.all(
    ['chiamaka', 'tunde'].map(async (who) => {
      const context = await browser.newContext()
      const page = await context.newPage()
      await signIn(page, `${who}@${domain}`, PASSWORD)
      await page.getByRole('heading', { name: /^Good/ }).waitFor()
      await openSheet(page, plusDays(today, 15), plusDays(today, 16))
      await pick(page, 'Junior Suite', /^Best available/)
      await guest(page, who === 'chiamaka' ? 'Ada' : 'Bola', 'Okoro', '08031234567')
      return { context, page }
    }),
  )
  await Promise.all(
    desks.map(({ page }) =>
      page
        .getByRole('dialog', { name: 'New reservation' })
        .getByRole('button', { name: /^Book · / })
        .click(),
    ),
  )
  const outcomes = await Promise.all(
    desks.map(async ({ page }) => {
      const sold = page.getByText(/^Junior Suite was just sold for/)
      const booked = page.getByText(/^Booked VI-/)
      await expect(sold.or(booked)).toBeVisible()
      return (await sold.isVisible()) ? 'sold' : 'booked'
    }),
  )
  expect(outcomes.sort()).toEqual(['booked', 'sold'])
  for (const { context } of desks) await context.close()
})

test('offline, New reservation waits for a connection', async ({ page, context }, testInfo) => {
  const domain = seedDemoGroup(`res-offline-${testInfo.project.name}`, PASSWORD)
  await signIn(page, `chiamaka@${domain}`, PASSWORD)
  await page.getByRole('heading', { name: /^Good/ }).waitFor()
  await page.goto('/reservations')
  await page
    .getByRole('link', { name: /Daniel Mensah/ })
    .first()
    .waitFor()
  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByRole('button', { name: /New reservation/ })).toBeDisabled()
  await expect(
    page.getByText('Needs a connection to check live availability').first(),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Daniel Mensah/ }).first()).toBeVisible()
  await context.setOffline(false)
})

test('the owner sees every hotel with a Hotel column, picks the hotel when booking, and an empty hotel', async ({
  page,
}, testInfo) => {
  const domain = seedDemoGroup(`res-owner-${testInfo.project.name}`, PASSWORD)
  await signIn(page, `adaeze@${domain}`, PASSWORD)
  await page.getByRole('heading', { name: /^Good/ }).waitFor()
  await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'All hotels' })
  await page.goto('/reservations')
  await expect(page.getByRole('columnheader', { name: 'Hotel' })).toBeVisible()
  await page.getByRole('button', { name: /New reservation/ }).click()
  const sheet = page.getByRole('dialog', { name: 'New reservation' })
  await expect(sheet.getByRole('combobox', { name: 'Hotel' })).toHaveValue('')
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()
  await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'Kora Abuja' })
  await expect(
    page.getByText(
      'No reservations at Kora Abuja yet. Bookings taken here, on the phone or at the desk, show in this list.',
    ),
  ).toBeVisible()
})
