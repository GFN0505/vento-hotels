// The tape chart, room moves and room status (spec: docs/specs/stage-1-tape-chart.md), on the demo
// group: assign from the Unassigned lane, move by dragging, extend by dragging a bar's end, an
// upgrade at the booked price approved with the GM's PIN, out of order refused then saved, Mark
// clean offline and synced, and All hotels asking for a hotel. Desktop; the day list on phones.
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

async function chartOf(page: Page, type?: string) {
  await page.goto('/tape-chart')
  await expect(page.getByRole('heading', { name: 'Tape chart' })).toBeVisible()
  if (type) await page.getByLabel('Room type').selectOption({ label: type })
}

async function digits(scope: Locator, pin: string) {
  for (const digit of pin) await scope.getByRole('button', { name: digit, exact: true }).click()
}

// Drags from the middle of one box to a point, in small steps, as a hand does.
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
}

const centre = async (locator: Locator) => {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error('not on screen')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'The grid is for wider screens; phones get the day list.')

  test('assigns from the Unassigned lane, moves by dragging, extends by dragging the end', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`chart-move-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'chiamaka', domain)
    await chartOf(page, 'Deluxe King')
    await expect(page.getByText(/rooms shown of 120$/)).toBeVisible()

    // Assign Mrs Adebayo from the lane, through the card and the dialog.
    await page
      .getByRole('button', { name: /^Unassigned/, expanded: false })
      .first()
      .click()
    // The seed's other Mrs Adebayo arrives later; today's is first.
    await page
      .getByRole('button', { name: /Funmilayo Adebayo, Deluxe King/ })
      .first()
      .click()
    await page
      .getByRole('dialog', { name: /^Funmilayo Adebayo · VI-/ })
      .getByRole('button', { name: /^Assign room/ })
      .click()
    const assign = page.getByRole('dialog', { name: 'Assign room · Funmilayo Adebayo' })
    // Inspected rooms come before clean ones: 408 is under Show all.
    await assign
      .getByRole('button', { name: /^Show all/ })
      .first()
      .click()
    await assign.getByRole('radio', { name: /^408 Deluxe King/ }).check()
    await assign.getByRole('button', { name: /^Assign 408/ }).click()
    await expect(page.getByText('Funmilayo Adebayo assigned to 408')).toBeVisible()

    // Drag Mrs Okafor from 404 to 401 (the lane closed again, so both rows are in view).
    const lane = page.getByRole('button', { name: /^Unassigned/, expanded: true })
    if (await lane.count()) await lane.first().click()
    const ngozi = await centre(page.getByRole('button', { name: /Ngozi Okafor, Deluxe King/ }))
    const row = await centre(page.getByRole('button', { name: /^Room 401 / }))
    await drag(page, ngozi, { x: ngozi.x, y: row.y })
    await expect(page.getByText('Ngozi Okafor moved to 401')).toBeVisible()

    // Drag the end of Mr Mensah's bar two nights on.
    await page.getByLabel('Room type').selectOption({ label: 'Executive King' })
    const mensah = await centre(page.getByRole('button', { name: /Daniel Mensah, Executive King/ }))
    const night = mensah.box.width / 3
    const end = { x: mensah.box.x + mensah.box.width - 3, y: mensah.y }
    await drag(page, end, { x: end.x + night * 2, y: end.y })
    const popover = page.getByRole('dialog', { name: /^Extend Daniel Mensah to/ })
    await expect(
      popover.getByText(/^Room 502 is free both nights\. Same plan, no approval needed\.$/),
    ).toBeVisible()
    await expect(popover.getByText('Added to stay')).toBeVisible()
    await popover.getByRole('button', { name: /^Extend stay/ }).click()
    await expect(page.getByText(/^Daniel Mensah extended to /)).toBeVisible()
  })

  test('moves a guest to a better room at the booked price with the GM’s PIN', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`chart-upgrade-${testInfo.project.name}`, PASSWORD)
    // The owner registers this browser as a front desk PC, then Chiamaka signs in with her PIN.
    await signedIn(page, 'adaeze', domain)
    await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'Kora Victoria Island' })
    await page.goto('/settings/devices')
    await page.getByRole('button', { name: 'Register this device' }).click()
    const register = page.getByRole('dialog', { name: 'Register this device' })
    await register.getByLabel('Name', { exact: true }).fill('FD-VI-04')
    await register.getByLabel("What it's for").selectOption({ label: 'Front desk PC' })
    await register.getByRole('button', { name: 'Register' }).click()
    await page
      .getByRole('dialog', { name: 'FD-VI-04 is registered' })
      .getByRole('button', { name: 'Lock this device' })
      .click()
    await page.getByRole('button', { name: /Chiamaka E\./ }).click()
    await digits(page.getByRole('main'), '2948')
    await page.getByRole('heading', { name: /^Good/ }).waitFor()

    await chartOf(page, 'Deluxe King')
    // Mrs Okafor's Deluxe King has free rooms: only Deluxe King is offered.
    await page.getByRole('button', { name: /Ngozi Okafor, Deluxe King/ }).click()
    await page
      .getByRole('dialog', { name: /^Ngozi Okafor · VI-/ })
      .getByRole('button', { name: /^Room move/ })
      .click()
    const hers = page.getByRole('dialog', { name: 'Room move · Ngozi Okafor' })
    await expect(hers.getByRole('radio', { name: /^401 Deluxe King/ })).toBeVisible()
    await expect(hers.getByRole('radio', { name: /Executive King/ })).toHaveCount(0)
    await hers.getByRole('button', { name: /^Cancel/ }).click()
    // Deluxe King is full on Mr Eze's second night: Executive King is offered as an upgrade.
    await page.getByRole('button', { name: /Chidi Eze, Deluxe King/ }).click()
    await page
      .getByRole('dialog', { name: /^Chidi Eze · VI-/ })
      .getByRole('button', { name: /^Room move/ })
      .click()
    const move = page.getByRole('dialog', { name: 'Room move · Chidi Eze' })
    await expect(move.getByText(/^No Deluxe King room is free for all of /)).toBeVisible()
    await move
      .getByRole('radio', { name: /Executive King/ })
      .first()
      .check()
    await move.getByRole('radio', { name: /^Keep ₦168,000\.00 a night/ }).check()
    await expect(
      move.getByText(/26\.32% discount on Executive King, over your 12(\.00)?% limit/),
    ).toBeVisible()
    await move.getByRole('button', { name: /^Ask for approval · 26\.32%/ }).click()
    const prompt = page.getByRole('dialog', { name: 'Needs a manager' })
    await prompt
      .getByRole('group', { name: 'Approving manager' })
      .getByText(/^Tunde Bello/)
      .click()
    await digits(prompt, '5072')
    await prompt.getByRole('button', { name: 'Approve upgrade and move' }).click()
    await expect(
      page.getByText(/^Chidi Eze moved to \S+ · upgrade approved by Tunde Bello$/),
    ).toBeVisible()
  })

  test('refuses an out-of-order that would leave Junior Suite short, then saves one that fits', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`chart-ooo-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'tunde', domain)
    await chartOf(page, 'Junior Suite')
    await page.getByRole('button', { name: /^Room 1104 / }).click()
    await page.getByRole('button', { name: 'Put out of order' }).click()
    const dialog = page.getByRole('dialog', { name: 'Put 1104 out of order' })
    const today = lagosToday()
    await dialog.getByLabel('Back in service').fill(plusDays(today, 30))
    await dialog.getByLabel('From').fill(plusDays(today, 16))
    await dialog.getByLabel('Back in service').fill(plusDays(today, 17))
    await expect(dialog.getByText(/^Junior Suite would be 1 room short on /)).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Put out of order/ })).toBeDisabled()
    await dialog.getByLabel('From').fill(plusDays(today, 15))
    await dialog.getByLabel('Back in service').fill(plusDays(today, 16))
    await expect(dialog.getByText(/^Junior Suite still has /)).toBeVisible()
    await dialog.getByText('AC', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Put out of order · 1 night' }).click()
    await expect(page.getByText(/^1104 out of order until /)).toBeVisible()
  })

  test('marks a room clean offline and syncs it when the connection is back', async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`chart-offline-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'chiamaka', domain)
    await chartOf(page, 'Executive King')
    await expect(
      page.getByRole('button', { name: /^Room 502 .*Dirty ?, Executive King$/ }),
    ).toBeVisible()
    await context.setOffline(true)
    await expect(page.getByText(/moving rooms and out of order need a connection/)).toBeVisible()
    await page.getByRole('button', { name: /^Room 502 .*Dirty ?, Executive King$/ }).click()
    await page.getByRole('button', { name: 'Mark clean' }).click()
    await expect(page.getByText('502 marked clean · Will sync')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /^Room 502 .*Clean.*will sync ?, Executive King$/ }),
    ).toBeVisible()
    await context.setOffline(false)
    await expect(
      page.getByRole('button', { name: /^Room 502 \S+ Clean ?, Executive King$/ }),
    ).toBeVisible({
      timeout: 40_000,
    })
  })

  test('books only from a night the room can be sold', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const domain = seedDemoGroup(`chart-cell-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'chiamaka', domain)
    await chartOf(page, 'Executive King')
    // The Tonight strip: its out-of-order figure shows just 503.
    await expect(page.getByRole('region', { name: 'Tonight' })).toContainText(/\d+ occupied/)
    await page.getByRole('button', { name: /^1 out of order$/ }).click()
    await expect(page.getByRole('button', { name: /^Room 503 Out of order/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Room 502 / })).toHaveCount(0)
    await page.getByRole('button', { name: /^1 out of order$/ }).click()
    // 503 is out of order today: its block is not a way to book.
    await page.getByText('Out of order · AC').first().click()
    await expect(page.getByRole('dialog', { name: /New reservation/ })).toHaveCount(0)
    // Two weeks on, every Executive King night is free: a cell starts a booking for that room.
    await page.getByRole('button', { name: 'Next week' }).click()
    await page.getByRole('button', { name: 'Next week' }).click()
    const label = await centre(page.getByRole('button', { name: /^Room 514 / }))
    await page.mouse.click(label.box.x + label.box.width + 40, label.y)
    await expect(page.getByText('Room 514 will be assigned.')).toBeVisible()
  })

  test('asks for a hotel with All hotels, then shows that hotel', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const domain = seedDemoGroup(`chart-all-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'adaeze', domain)
    await page.goto('/tape-chart')
    await expect(page.getByText('The tape chart is per hotel. Pick a hotel.')).toBeVisible()
    await page.getByRole('button', { name: /^Kora Ikeja GRA/ }).click()
    await expect(page.getByText('Out of order · Renovation').first()).toBeVisible()
  })
})

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'Phones get the day list.')

  test('marks a room clean from the day list and assigns an arrival', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`chart-phone-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'chiamaka', domain)
    await page.goto('/tape-chart')
    await expect(page.getByText('Business date', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^502 .*Dirty/ }).click()
    await page
      .getByRole('dialog', { name: 'Room 502' })
      .getByRole('button', { name: 'Mark clean' })
      .click()
    await expect(page.getByText('502 marked clean')).toBeVisible()
    await page
      .getByRole('button', { name: /^Unassigned · \d+ arriving/ })
      .first()
      .click()
    await page
      .getByRole('dialog', { name: 'Unassigned' })
      .getByRole('button', { name: 'Assign room' })
      .first()
      .click()
    const assign = page.getByRole('dialog', { name: /^Assign room · / })
    await assign.getByRole('radio').first().click()
    await assign.getByRole('button', { name: /^Assign \S+/ }).click()
    await expect(page.getByText(/ assigned to \S+$/)).toBeVisible()
  })
})
