// The hotel switch scopes every page (spec: docs/specs/stage-1-hotel-switch-scope.md), on the demo
// group: Members, Devices, Companies and Permissions follow the top bar; ?hotel= links select a
// hotel and leave the address bar; Sade, on two of four hotels, has no All hotels. Desktop and phone.
import { expect, type Page, test } from '@playwright/test'
import { expectAccessible, seedDemoGroup, signIn, switchToDarkMode } from './support'

const PASSWORD = 'Demo-pass-42!'
let domain = ''

// biome-ignore lint/correctness/noEmptyPattern: Playwright needs the fixtures argument destructured.
test.beforeAll(({}, testInfo) => {
  domain = seedDemoGroup(`switch-${testInfo.project.name}`, PASSWORD)
})

async function signInAs(page: Page, name: string) {
  await signIn(page, `${name}@${domain}`, PASSWORD)
  await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()
}

const hotelSwitch = (page: Page) => page.getByLabel('Hotel', { exact: true })
const choose = (page: Page, hotel: string) => hotelSwitch(page).selectOption({ label: hotel })
const title = (page: Page, name: string) => page.getByRole('heading', { name, level: 1 })
const eyebrow = (page: Page, text: string) =>
  page.locator('main').getByText(text, { exact: true }).first()

async function hotelId(page: Page, hotel: string): Promise<string> {
  const value = await hotelSwitch(page).locator('option', { hasText: hotel }).getAttribute('value')
  if (!value) throw new Error(`No ${hotel} in the switch`)
  return value
}

test('members follow the switch: everyone, then the people who work at Kora Abuja', async ({
  page,
}) => {
  await signInAs(page, 'adaeze')
  await page.goto('/settings/members')
  await expect(eyebrow(page, 'All hotels')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'People 11' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Invited 1' })).toBeVisible()
  await expect(page).toHaveTitle('Members and roles · All hotels · Vento Hotels')

  await choose(page, 'Kora Abuja')
  await expect(title(page, 'Members and roles')).toBeFocused()
  await expect(page.getByText('Showing Kora Abuja')).toBeAttached()
  await expect(page).toHaveTitle('Members and roles · Kora Abuja · Vento Hotels')
  await expect(eyebrow(page, 'Kora Abuja')).toBeVisible()
  await expect(
    page.getByText('People who work at Kora Abuja, including 2 with access to the whole group.'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'People 2' })).toBeVisible()
  await expect(
    page.getByText('Whole group', { exact: true }).filter({ visible: true }),
  ).toHaveCount(2)
  await expect(page.getByText(`ngozi@${domain}`)).toBeVisible()
  await expect(
    page.getByText('Nobody works only at Kora Abuja yet.', { exact: false }),
  ).toBeVisible()
  await expectAccessible(page)

  // A new invite starts on the hotel in view.
  await page.getByRole('button', { name: 'Invite people' }).first().click()
  const invite = page.getByRole('dialog', { name: 'Invite people' })
  await expect(invite.getByLabel('Only these hotels')).toBeChecked()
  await expect(invite.getByLabel('Kora Abuja')).toBeChecked()
  await expect(invite.getByLabel('Kora Victoria Island')).not.toBeChecked()
  await invite.getByRole('button', { name: 'Cancel' }).click()

  // Filters stay when the hotel changes; the invite for Abuja doesn't show at Victoria Island.
  await page.getByRole('button', { name: 'Managers' }).click()
  await choose(page, 'Kora Victoria Island')
  await expect(page.getByRole('button', { name: 'Managers' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText(`ngozi@${domain}`)).toHaveCount(0)
  await expect(page.getByText('Tunde Bello')).toBeVisible()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'People 11' })).toBeVisible()
})

test('devices follow the switch, and each row names its hotel under All hotels', async ({
  page,
}) => {
  await signInAs(page, 'adaeze')
  await page.goto('/settings/devices')
  await expect(page).toHaveTitle('Devices · All hotels · Vento Hotels')
  await expect(page.getByRole('heading', { name: 'Shared devices 4' })).toBeVisible()
  await expect(page.getByText('Front desk PC · Kora Ikeja GRA')).toBeVisible()
  await expect(page.getByText('Front desk PC · Kora Victoria Island')).toBeVisible()

  await choose(page, 'Kora Ikeja GRA')
  await expect(title(page, 'Devices')).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Shared devices 1' })).toBeVisible()
  await expect(page.getByText('FD-IKJ-01')).toBeVisible()
  await expect(page.getByText('Front desk PC', { exact: true })).toBeVisible()
  await expect(page.getByText('FD-VI-01')).toHaveCount(0)

  await choose(page, 'Kora Abuja')
  await expect(page.getByText('No shared devices at Kora Abuja yet')).toBeVisible()
  await expect(page.getByText('FD-IKJ-01')).toHaveCount(0)
  await expectAccessible(page)
  await switchToDarkMode(page)
  await expect(page.getByText('No shared devices at Kora Abuja yet')).toBeVisible()
  await expectAccessible(page)
})

test('registering a device under All hotels asks for its hotel', async ({ page }, testInfo) => {
  // Its own copy of the group, so the new device never changes the other tests' counts.
  const own = seedDemoGroup(`switch-register-${testInfo.project.name}`, PASSWORD)
  await signIn(page, `adaeze@${own}`, PASSWORD)
  await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()
  await page.goto('/settings/devices')
  await page.getByRole('button', { name: 'Register this device' }).click()
  const dialog = page.getByRole('dialog', { name: 'Register this device' })
  await dialog.getByLabel('Name').fill('FD-ABJ-01')
  await dialog.getByLabel("What it's for").selectOption({ label: 'Front desk PC' })
  await dialog.getByRole('button', { name: 'Register' }).click()
  await expect(dialog.getByText('Choose the hotel this device is at')).toBeVisible()
  await dialog.getByLabel('Hotel').selectOption({ label: 'Kora Abuja' })
  await dialog.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByText('FD-ABJ-01 registered at Kora Abuja')).toBeVisible()
  // This browser is now Kora Abuja's device, so the top bar moves there.
  await expect(hotelSwitch(page).locator('option:checked')).toHaveText('Kora Abuja')
  await page.getByRole('dialog', { name: 'FD-ABJ-01 is registered' }).getByText('Done').click()
  await expect(page.getByRole('heading', { name: 'Shared devices 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lock this device' })).toBeVisible()

  // Another hotel in view: the device still offers to lock, and says where it belongs.
  await choose(page, 'Kora Ikeja GRA')
  await expect(page.getByText('Registered at Kora Abuja', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lock this device' })).toBeVisible()
})

test('companies and permissions name their scope', async ({ page }) => {
  await signInAs(page, 'adaeze')
  await choose(page, 'Kora Abuja')
  await page.goto('/settings/companies')
  await expect(page).toHaveTitle('Companies · Kora Abuja · Vento Hotels')
  await expect(
    page.getByText(
      'Kora Abuja is owned by Kora Hotels Abuja Ltd. Choose All hotels in the top bar to see every company.',
    ),
  ).toBeVisible()
  await choose(page, 'All hotels')
  await expect(page.getByText('Kora Hotels Group · 3 companies')).toBeVisible()

  await page.goto('/settings/permissions')
  await expect(eyebrow(page, 'Whole group')).toBeVisible()
  await expect(page).toHaveTitle('Permissions and limits · Kora Hotels Group · Vento Hotels')
  await expect(
    page.getByText('Permissions are set per role and apply at every hotel.', { exact: false }),
  ).toBeVisible()
  await choose(page, 'Kora Ikeja GRA')
  await expect(eyebrow(page, 'Whole group')).toBeVisible()
  await expect(page).toHaveTitle('Permissions and limits · Kora Hotels Group · Vento Hotels')
})

test('a link that names a hotel opens on it, then leaves the address bar', async ({ page }) => {
  await signInAs(page, 'adaeze')
  const abuja = await hotelId(page, 'Kora Abuja')
  await page.goto(`/settings/devices?hotel=${abuja}`)
  await expect(page.getByText('No shared devices at Kora Abuja yet')).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/devices$/)
  await expect(hotelSwitch(page).locator('option:checked')).toHaveText('Kora Abuja')

  await page.goto('/settings/members?hotel=all')
  await expect(page.getByRole('heading', { name: 'People 11' })).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/members$/)

  // An unknown hotel: one neutral message, and the page stays on what was chosen.
  await page.goto('/settings/devices?hotel=0193a000-0000-7000-8000-00000000dead')
  await expect(
    page.getByText("That link is for a hotel you can't open. Showing all hotels."),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/devices$/)
  await expect(page.getByRole('heading', { name: 'Shared devices 4' })).toBeVisible()

  // Home's figures for one hotel link to that hotel.
  await page.goto('/')
  await choose(page, 'Kora Ikeja GRA')
  await page.locator('dt:text-is("People") + dd').getByRole('link').click()
  await expect(page).toHaveURL(/\/settings\/members$/)
  await expect(page.getByRole('heading', { name: 'People 3' })).toBeVisible()
})

test('Sade, on two of four hotels, switches between them and has no All hotels', async ({
  page,
  browser,
}) => {
  // Kora Abuja's id, as the owner sees it, for a link Sade can't open.
  const owner = await browser.newContext()
  const ownerPage = await owner.newPage()
  await signInAs(ownerPage, 'adaeze')
  const abuja = await hotelId(ownerPage, 'Kora Abuja')
  await owner.close()

  await signInAs(page, 'sade')
  await expect(hotelSwitch(page).locator('option')).toHaveText([
    'Kora Ikeja GRA',
    'Kora Victoria Island',
  ])
  await page.goto('/reservations')
  const current = await hotelSwitch(page).locator('option:checked').textContent()
  await expect(page).toHaveTitle(`Reservations · ${current} · Vento Hotels`)
  await choose(page, 'Kora Ikeja GRA')
  await expect(eyebrow(page, 'Kora Ikeja GRA')).toBeVisible()
  await expect(page).toHaveTitle('Reservations · Kora Ikeja GRA · Vento Hotels')

  await page.goto(`/reservations?hotel=${abuja}`)
  await expect(
    page.getByText("That link is for a hotel you can't open. Showing Kora Ikeja GRA."),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/reservations$/)
  await expect(eyebrow(page, 'Kora Ikeja GRA')).toBeVisible()
})

test('Tunde, on one hotel, has no switch and every page names his hotel', async ({ page }) => {
  await signInAs(page, 'tunde')
  await expect(hotelSwitch(page)).toHaveCount(0)
  await page.goto('/rates/rooms')
  await expect(eyebrow(page, 'Kora Victoria Island')).toBeVisible()
  await expect(page).toHaveTitle('Rooms · Kora Victoria Island · Vento Hotels')
})
