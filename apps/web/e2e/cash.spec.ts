// Cashier shifts (spec: docs/specs/stage-1-cashier-shifts.md), on the demo group: Chiamaka's open
// shift counted blind (no expected figure until she submits), closed ₦1,000.00 short with a reason;
// the Shifts list then says so. The owner with All hotels is asked for a hotel, then reads every
// shift and Ibrahim's night shift with its safe bag. Desktop and phone.
import { expect, type Page, test } from '@playwright/test'
import { seedDemoGroup, signIn } from './support'

const PASSWORD = 'Demo-pass-42!'

async function signedIn(page: Page, who: string, domain: string) {
  await signIn(page, `${who}@${domain}`, PASSWORD)
  await page.getByRole('heading', { name: /^Good/ }).waitFor()
}

test('counts blind and closes a shift with a difference', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const domain = seedDemoGroup(`cash-${testInfo.project.name}`, PASSWORD)
  await signedIn(page, 'chiamaka', domain)
  await page.goto('/cash')
  await expect(page.getByRole('heading', { name: /^Cashier shift 1 · / })).toBeVisible()
  await expect(
    page.getByText('Takings stay hidden until you count, so your count is your own.'),
  ).toBeVisible()
  await expect(page.getByText('Expected', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Count and close' }).click()
  await expect(
    page.getByRole('heading', { name: 'Cashier shift 1 · step 1 of 2: count' }),
  ).toBeVisible()
  await page.getByLabel('Notes of ₦1,000').fill('49')
  await expect(page.getByText('₦49,000.00').filter({ visible: true }).first()).toBeVisible()
  // POS and transfers must be entered, 0 allowed: the first one left empty gets the focus.
  await page.getByRole('button', { name: 'Submit count' }).click()
  await expect(
    page.getByText('Enter the slip total, or 0 if the terminal took nothing this shift.'),
  ).toBeVisible()
  await page.getByLabel(/^POS terminal · Moniepoint · Desk 1/).fill('0')
  await page.getByLabel('Bank transfers').fill('0')
  await expect(page.getByText('Expected', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Submit count' }).click()
  const confirm = page.getByRole('dialog', { name: 'Submit your count?' })
  await expect(
    confirm.getByText(/^Cash ₦49,000\.00 · US\$0\.00 · £0\.00 · POS ₦0\.00 · Transfers ₦0\.00\./),
  ).toBeVisible()
  await confirm.getByRole('button', { name: 'Submit count' }).click()

  // Only now: expected, the difference and the reason.
  await expect(page.getByText(/^Count submitted \d\d:\d\d · locked$/)).toBeVisible()
  await expect(
    page.getByText('Expected', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(page.getByText('Cash ₦1,000.00 short')).toBeVisible()
  await expect(page.getByText('Within your ₦5,000.00 limit')).toBeVisible()
  await page.getByRole('button', { name: 'Close shift', exact: true }).click()
  await expect(page.getByText('Add a reason for the difference.').first()).toBeVisible()
  await page.getByLabel('Reason for the difference').fill('Change given in error at check-out')
  await page.getByRole('button', { name: 'Close shift', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Shift 1 closed' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open a new shift' })).toBeVisible()

  await page.goto('/cash/shifts')
  await expect(page.getByRole('heading', { name: 'Your shifts' })).toBeVisible()
  await expect(
    page
      .getByText(/₦1,000\.00 short/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible()
})

test('asks for a hotel with All hotels, and lists every shift for the GM', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const domain = seedDemoGroup(`cash-all-${testInfo.project.name}`, PASSWORD)
  await signedIn(page, 'adaeze', domain)
  await page.goto('/cash/shifts?hotel=all')
  await expect(page.getByText('Cashier shifts are per hotel. Pick a hotel.')).toBeVisible()
  await page.getByRole('button', { name: /^Kora Victoria Island/ }).click()
  await expect(page.getByRole('heading', { name: 'Shifts', exact: true })).toBeVisible()
  await expect(
    page
      .getByText(/Counted at close/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible()
  await expect(
    page
      .getByText(/₦12,500\.00 over/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible()
  await page
    .getByRole('button', { name: /^Shift 3 · / })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: /^Shift 3 · .* · Desk 2$/ })
  await expect(sheet.getByText('To the safe · bag S-2210')).toBeVisible()
})
