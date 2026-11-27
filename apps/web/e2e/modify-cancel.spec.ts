// Modify, cancel and no-show (spec: docs/specs/stage-1-modify-cancel.md), on the demo group:
// extend a stay by a night, change the room type, a room type sold out on a new night, cancel with
// the penalty, cancel with a waiver by a manager's PIN at the desk, a no-show whose waiver goes to
// the GM's inbox and is approved from his browser, and Modify disabled offline. Desktop and phone.
import { expect, type Locator, type Page, test } from '@playwright/test'
import { seedDemoGroup, signIn } from './support'

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

async function signedIn(page: Page, who: string, domain: string) {
  await signIn(page, `${who}@${domain}`, PASSWORD)
  await page.getByRole('heading', { name: /^Good/ }).waitFor()
}

// Opens a reservation from the list by the guest's name.
async function open(page: Page, guest: string) {
  await page.goto('/reservations?view=all')
  await page.getByRole('searchbox').fill(guest)
  await page.getByRole('link', { name: guest }).first().click()
  await expect(page.getByRole('heading', { name: guest })).toBeVisible()
}

async function digits(scope: Locator, pin: string) {
  for (const digit of pin) await scope.getByRole('button', { name: digit, exact: true }).click()
}

test('extends a stay by a night, then moves it to another room type', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const domain = seedDemoGroup(`mod-extend-${testInfo.project.name}`, PASSWORD)
  await signedIn(page, 'chiamaka', domain)
  await open(page, 'Nkechi Ude')
  await page.getByRole('button', { name: /^Modify/ }).click()
  const dialog = page.getByRole('dialog', { name: /^Modify reservation · VI-/ })
  const leave = dialog.getByLabel('Leave')
  const departure = await leave.inputValue()
  await leave.fill(plusDays(departure, 1))
  await expect(dialog.getByText('+1 night')).toBeVisible()
  await expect(dialog.getByText(/new night at today's rate/)).toBeVisible()
  await expect(
    dialog.getByText(/^Deluxe King is free on .*Same plan, no approval needed\.$/),
  ).toBeVisible()
  const save = dialog.getByRole('button', { name: /^Save · \+₦/ })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/^VI-\d{4}-\d{4} changed$/)).toBeVisible()
  await expect(page.getByText('Changed', { exact: true }).first()).toBeVisible()

  // Executive King: every night re-priced at that type's rate.
  await page.getByRole('button', { name: /^Modify/ }).click()
  await dialog.getByLabel('Room type').selectOption({ label: 'Executive King' })
  await expect(dialog.getByText(/new night at today's rate/).first()).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Save · \+₦/ })).toBeEnabled()
  await dialog.getByRole('button', { name: /^Cancel/ }).click()
})

test('shows a room type sold out on a new night and keeps it from being picked', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const domain = seedDemoGroup(`mod-soldout-${testInfo.project.name}`, PASSWORD)
  await signedIn(page, 'chiamaka', domain)
  await open(page, 'Nkechi Ude')
  await page.getByRole('button', { name: /^Modify/ }).click()
  const dialog = page.getByRole('dialog', { name: /^Modify reservation · VI-/ })
  // The Adeyemi–Nwosu wedding has every Junior Suite on D+16 (seed/reservations.ts).
  const today = lagosToday()
  await dialog.getByLabel('Arrive').fill(plusDays(today, 15))
  await dialog.getByLabel('Leave').fill(plusDays(today, 17))
  const suite = dialog.getByRole('option', { name: /^Junior Suite · Sold out/ })
  await expect(suite).toBeAttached()
  await expect(suite).toBeDisabled()
})

test('cancels inside the penalty window, with the penalty to charge', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const domain = seedDemoGroup(`cancel-pen-${testInfo.project.name}`, PASSWORD)
  await signedIn(page, 'chiamaka', domain)
  await open(page, 'Kelechi Obi')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /^Cancel reservation · VI-/ })
  await expect(dialog.getByText(/^Arrives tomorrow · free cancellation ended/)).toBeVisible()
  await expect(dialog.getByText(/^First night · ₦/)).toBeVisible()
  await expect(dialog.getByText(/^2 nights released/)).toBeVisible()
  const button = dialog.getByRole('button', { name: /^Cancel booking · ₦.* penalty$/ })
  await button.click()
  await expect(dialog.getByText('Pick a reason for cancelling.')).toBeVisible()
  await dialog.getByText('Guest request', { exact: true }).click()
  await dialog.getByLabel('Note (optional)').fill('Meeting moved to January')
  await button.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/^VI-\d{4}-\d{4} cancelled$/)).toBeVisible()
  await expect(
    page.getByText(/^Cancelled .* by Chiamaka Eze · Guest request · “Meeting moved to January”$/),
  ).toBeVisible()
  const card = page.getByRole('heading', { name: 'Penalty' }).locator('..')
  await expect(card.getByText('To charge')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Ask to waive' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy cancellation' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Modify/ })).toHaveCount(0)
})

test('cancels and waives with the GM’s PIN at a registered front desk PC', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const domain = seedDemoGroup(`cancel-pin-${testInfo.project.name}`, PASSWORD)
  // The owner registers this browser as a front desk PC, then Chiamaka signs in with her PIN.
  await signedIn(page, 'adaeze', domain)
  await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'Kora Victoria Island' })
  await page.goto('/settings/devices')
  await page.getByRole('button', { name: 'Register this device' }).click()
  const register = page.getByRole('dialog', { name: 'Register this device' })
  await register.getByLabel('Name', { exact: true }).fill('FD-VI-03')
  await register.getByLabel("What it's for").selectOption({ label: 'Front desk PC' })
  await register.getByRole('button', { name: 'Register' }).click()
  await page
    .getByRole('dialog', { name: 'FD-VI-03 is registered' })
    .getByRole('button', { name: 'Lock this device' })
    .click()
  await page.getByRole('button', { name: /Chiamaka E\./ }).click()
  await digits(page.getByRole('main'), '2948')
  await page.getByRole('heading', { name: /^Good/ }).waitFor()

  await open(page, 'Kelechi Obi')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /^Cancel reservation · VI-/ })
  await dialog.getByText('Guest request', { exact: true }).click()
  await dialog.getByText('Waive the penalty').click()
  await dialog.getByLabel('Reason for waiving').fill('Regular guest, rebooking for January')
  await expect(
    dialog.getByText(/^Waiving needs a manager\. Sade, Tunde or Adaeze can approve it\.$/),
  ).toBeVisible()
  await dialog.getByRole('button', { name: /^Ask to waive ₦/ }).click()
  const prompt = page.getByRole('dialog', { name: 'Needs a manager' })
  await expect(
    prompt.getByText(/^Waive penalty ₦.* on VI-\d{4}-\d{4} · Kelechi Obi$/),
  ).toBeVisible()
  await expect(prompt.getByText(/^Chiamaka can't waive penalties\. Asked at/)).toBeVisible()
  await prompt
    .getByRole('group', { name: 'Approving manager' })
    .getByText(/^Tunde Bello/)
    .click()
  await digits(prompt, '5072')
  await prompt.getByRole('button', { name: 'Approve waiver and cancel' }).click()
  await expect(page.getByText(/^VI-\d{4}-\d{4} cancelled · penalty waived$/)).toBeVisible()
  await expect(
    page.getByText(/^Waived · Approved by Tunde Bello · “Regular guest, rebooking for January”$/),
  ).toBeVisible()
})

test('marks a no-show and the GM waives it from his inbox in another browser', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const domain = seedDemoGroup(`noshow-inbox-${testInfo.project.name}`, PASSWORD)
  const desk = await (await browser.newContext()).newPage()
  const manager = await (await browser.newContext()).newPage()
  await signedIn(desk, 'ibrahim', domain)
  await open(desk, 'Abubakar Sule')
  await desk.getByRole('button', { name: 'More: no-show' }).click()
  await desk.getByRole('menuitem', { name: 'Mark no-show' }).click()
  const dialog = desk.getByRole('dialog', { name: /^Mark no-show · VI-/ })
  await expect(dialog.getByText(/^Arrival .* · not checked in$/)).toBeVisible()
  await expect(
    dialog.getByText("Mark a no-show only when the guest won't arrive tonight."),
  ).toBeVisible()
  await dialog.getByText('Waive the penalty').click()
  await dialog.getByLabel('Reason for waiving').fill('Flight cancelled, guest called 21:30')
  await dialog.getByRole('button', { name: /^Ask to waive ₦/ }).click()
  const prompt = desk.getByRole('dialog', { name: 'Needs a manager' })
  await prompt
    .getByRole('group', { name: 'Approving manager' })
    .getByText(/^Tunde Bello/)
    .click()
  await prompt
    .getByRole('button', { name: "Mark no-show now and send the waiver to Tunde's inbox" })
    .click()
  await expect(desk.getByText(/marked no-show · waiver sent to Tunde$/)).toBeVisible()
  await expect(desk.getByText(/^Waiver asked of Tunde Bello · expires \d\d:\d\d$/)).toBeVisible()

  await signedIn(manager, 'tunde', domain)
  const bell = manager.getByRole('button', { name: 'Approvals, 1 waiting for you' })
  await expect(bell).toBeVisible({ timeout: 40_000 })
  await bell.click()
  const panel = manager.getByRole('region', { name: 'Notifications' })
  await expect(panel.getByText('Penalty waiver waiting for you')).toBeVisible()
  await panel.getByRole('link', { name: 'Review' }).click()
  const card = manager.getByRole('article', { name: /^Waive ₦.* · VI-\d{4}-\d{4}$/ })
  await expect(card.getByText('“Flight cancelled, guest called 21:30”')).toBeVisible()
  const approveWithPin = card.getByRole('button', { name: 'Approve with PIN' })
  if (await approveWithPin.isVisible()) {
    await approveWithPin.click()
    const pin = manager.getByRole('dialog', { name: 'Approve the waiver for Abubakar Sule' })
    await digits(pin, '5072')
    await pin.getByRole('button', { name: 'Approve waiver' }).click()
  } else {
    await digits(card, '5072')
    await card.getByRole('button', { name: 'Approve waiver' }).click()
  }
  await expect(manager.getByText('Approved the waiver for Abubakar Sule')).toBeVisible()

  // Within seconds the desk's Penalty card says so, without a reload.
  await expect(desk.getByText(/^Waived · Approved by Tunde Bello · “Flight cancelled/)).toBeVisible(
    {
      timeout: 15_000,
    },
  )
})

test('disables Modify and Cancel offline, with the reason', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const domain = seedDemoGroup(`mod-offline-${testInfo.project.name}`, PASSWORD)
  await signedIn(page, 'chiamaka', domain)
  await open(page, 'Kelechi Obi')
  await page.context().setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByText('Changing a booking needs a connection.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Modify/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await page.context().setOffline(false)
})
