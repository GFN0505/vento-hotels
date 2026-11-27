// Approvals (spec: docs/specs/stage-1-approvals.md), on the demo group. Same screen: on a
// registered front desk PC, Chiamaka asks for 15%, Tunde types a wrong PIN and then his own, and
// the booking shows "Approved by Tunde Bello". Inbox: from her own laptop she sends it to Tunde,
// who approves from the bell in another browser; Book lights up on her screen without a reload.
// Desktop and phone.
import { expect, type Locator, type Page, test } from '@playwright/test'
import { expectAccessible, seedDemoGroup, signIn } from './support'

const PASSWORD = 'Demo-pass-42!'

const lagosToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

// New reservation to Review & book: Deluxe King, Bed & breakfast, 1 adult, 15% Repeat guest.
async function toReview(page: Page, arrival: string, departure: string): Promise<Locator> {
  await page.goto('/reservations?sheet=new')
  const sheet = page.getByRole('dialog', { name: 'New reservation' })
  await sheet.getByLabel('Arrival').fill(arrival)
  await sheet.getByLabel('Departure').fill(departure)
  await sheet.getByLabel('Adults').fill('1')
  await sheet.getByLabel('Adults').press('Enter')
  await expect(sheet.getByText('Left per night').first()).toBeVisible()
  const show = sheet.getByRole('button', { name: /plans? for Deluxe King$/ })
  if (await show.isVisible()) await show.click()
  await sheet.getByRole('radio', { name: /^Bed & breakfast/ }).check()
  await expect(sheet.getByText(/total for the stay/).first()).toBeVisible()
  await sheet.getByRole('button', { name: 'Change rate' }).click()
  await sheet.getByLabel('Discount', { exact: true }).fill('15')
  await sheet.getByText('Repeat guest').click()
  await expect(
    sheet.getByText(
      '15% is over your 12% discount limit. A manager with a higher limit can approve it when you book.',
    ),
  ).toBeVisible()
  await expect(async () => {
    await sheet.getByRole('button', { name: 'Continue to guest' }).click()
    await expect(sheet.getByLabel('First name')).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await sheet.getByLabel('First name').fill('Sarah')
  await sheet.getByLabel('Last name').fill('Collins')
  await sheet.getByRole('textbox', { name: 'Phone', exact: true }).fill('+44 7700 900123')
  await sheet.getByRole('button', { name: 'Continue to review' }).click()
  await expect(sheet.getByRole('heading', { name: 'Review & book' })).toBeVisible()
  return sheet
}

async function digits(scope: Locator, pin: string) {
  for (const digit of pin) await scope.getByRole('button', { name: digit, exact: true }).click()
}

test('a manager approves at the desk with his PIN and the booking shows him', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const domain = seedDemoGroup(`appr-pin-${testInfo.project.name}`, PASSWORD)
  // The owner registers this browser as a front desk PC of Kora Victoria Island, then locks it.
  await signIn(page, `adaeze@${domain}`, PASSWORD)
  await page.getByRole('heading', { name: /^Good/ }).waitFor()
  await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'Kora Victoria Island' })
  await page.goto('/settings/devices')
  await page.getByRole('button', { name: 'Register this device' }).click()
  const register = page.getByRole('dialog', { name: 'Register this device' })
  await register.getByLabel('Name', { exact: true }).fill('FD-VI-02')
  await register.getByLabel("What it's for").selectOption({ label: 'Front desk PC' })
  await register.getByRole('button', { name: 'Register' }).click()
  await page
    .getByRole('dialog', { name: 'FD-VI-02 is registered' })
    .getByRole('button', { name: 'Lock this device' })
    .click()
  await expect(page).toHaveURL(/\/lock$/)
  await page.getByRole('button', { name: /Chiamaka E\./ }).click()
  await digits(page.getByRole('main'), '2948')
  await page.getByRole('heading', { name: /^Good/ }).waitFor()

  const today = lagosToday()
  const sheet = await toReview(page, plusDays(today, 12), plusDays(today, 15))
  await sheet.getByRole('button', { name: 'Ask for approval · 15%' }).click()
  const prompt = page.getByRole('dialog', { name: 'Needs a manager' })
  await expect(prompt.getByText('Discount 15% on Deluxe King · Bed & breakfast')).toBeVisible()
  await expect(prompt.getByText('₦617,400.00 → ₦524,790.00')).toBeVisible()
  const managers = prompt.getByRole('group', { name: 'Approving manager' })
  await expect(managers.getByRole('radio')).toHaveCount(3)
  await expect(managers.getByText(/Chiamaka/)).toHaveCount(0)
  await expect(prompt.getByText('Pick who to ask')).toBeVisible()
  await expectAccessible(page)

  await managers.getByText(/^Tunde Bello/).click()
  await expect(prompt.getByText('Tunde, enter your PIN')).toBeVisible()
  await digits(prompt, '1111')
  await prompt.getByRole('button', { name: 'Approve 15% and book' }).click()
  await expect(prompt.getByText("That PIN didn't match. 4 tries left.")).toBeVisible()
  await digits(prompt, '5072')
  await prompt.getByRole('button', { name: 'Approve 15% and book' }).click()

  await expect(page.getByRole('heading', { name: 'Sarah Collins' })).toBeVisible()
  await expect(page.getByText(/^Booked VI-\d{4}-\d{4} for Sarah Collins$/)).toBeVisible()
  await expect(
    page.getByText(/15% discount, Repeat guest \(Chiamaka Eze\) · Approved by Tunde Bello/),
  ).toBeVisible()
})

test('a request to the manager’s inbox is approved from his browser and the desk books', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const domain = seedDemoGroup(`appr-inbox-${testInfo.project.name}`, PASSWORD)
  const desk = await (await browser.newContext()).newPage()
  const manager = await (await browser.newContext()).newPage()
  await signIn(desk, `chiamaka@${domain}`, PASSWORD)
  await desk.getByRole('heading', { name: /^Good/ }).waitFor()
  const today = lagosToday()
  const sheet = await toReview(desk, plusDays(today, 13), plusDays(today, 16))
  await sheet.getByRole('button', { name: 'Ask for approval · 15%' }).click()
  const prompt = desk.getByRole('dialog', { name: 'Needs a manager' })
  // Her laptop isn't a registered hotel device: no PIN pad, the inbox only.
  await expect(
    prompt.getByText(
      'Approvers enter their PIN on a shared hotel device. From here, send the request to their inbox.',
    ),
  ).toBeVisible()
  await prompt
    .getByRole('group', { name: 'Approving manager' })
    .getByText(/^Tunde Bello/)
    .click()
  await prompt.getByRole('button', { name: "Send to Tunde's inbox" }).click()
  await expect(
    sheet.getByText(/^Waiting for Tunde Bello · asked \d\d:\d\d · expires \d\d:\d\d$/),
  ).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Waiting for approval' })).toBeDisabled()

  await signIn(manager, `tunde@${domain}`, PASSWORD)
  await manager.getByRole('heading', { name: /^Good/ }).waitFor()
  const bell = manager.getByRole('button', { name: 'Approvals, 1 waiting for you' })
  await expect(bell).toBeVisible({ timeout: 40_000 })
  await bell.click()
  const panel = manager.getByRole('region', { name: 'Notifications' })
  await expect(panel.getByText('15% discount waiting for you')).toBeVisible()
  await panel.getByRole('link', { name: 'Review' }).click()
  const card = manager.getByRole('article', { name: 'Discount 15% · Sarah Collins' })
  await expect(card.getByText('₦617,400.00 → ₦524,790.00')).toBeVisible()
  // Decline needs a comment.
  await card.getByRole('button', { name: 'Decline' }).click()
  await expect(card.getByText('Add a comment so Chiamaka knows why.')).toBeVisible()
  const approveWithPin = card.getByRole('button', { name: 'Approve with PIN' })
  if (await approveWithPin.isVisible()) {
    await approveWithPin.click()
    const pin = manager.getByRole('dialog', { name: 'Approve 15% for Sarah Collins' })
    await digits(pin, '5072')
    await pin.getByRole('button', { name: 'Approve discount' }).click()
  } else {
    await digits(card, '5072')
    await card.getByRole('button', { name: 'Approve discount' }).click()
  }
  await expect(manager.getByText('Approved 15% for Sarah Collins')).toBeVisible()

  // Without touching anything, her Review says so and Book lights up.
  await expect(sheet.getByText(/^Approved by Tunde Bello at \d\d:\d\d$/)).toBeVisible({
    timeout: 10_000,
  })
  await sheet.getByRole('button', { name: /^Book · ₦524,790\.00/ }).click()
  await expect(desk.getByRole('heading', { name: 'Sarah Collins' })).toBeVisible()
  await expect(desk.getByText(/Approved by Tunde Bello/).first()).toBeVisible()
})
