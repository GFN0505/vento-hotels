// The hotel switch's edge cases (spec: stage-1-hotel-switch-scope, "Empty, error and edge cases"):
// access removed while a hotel is open, a shared device given a link to another hotel, a link
// during a role preview, and a group left with one hotel. Desktop and phone.
import { expect, type Locator, type Page, test } from '@playwright/test'
import { choose, linkFromEmail, seedDemoGroup, signIn, signUpOwnerWithGroup } from './support'

const PASSWORD = 'Demo-pass-42!'
let domain = ''

// biome-ignore lint/correctness/noEmptyPattern: Playwright needs the fixtures argument destructured.
test.beforeAll(({}, testInfo) => {
  domain = seedDemoGroup(`edges-${testInfo.project.name}`, PASSWORD)
})

async function signInAs(page: Page, name: string, at = domain) {
  await signIn(page, `${name}@${at}`, PASSWORD)
  await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()
}

const hotelSwitch = (page: Page) => page.getByLabel('Hotel', { exact: true })

async function hotelId(page: Page, hotel: string): Promise<string> {
  const value = await hotelSwitch(page).locator('option', { hasText: hotel }).getAttribute('value')
  if (!value) throw new Error(`No ${hotel} in the switch`)
  return value
}

async function openMenuLink(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open menu' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()
}

async function editSade(page: Page, change: (dialog: Locator) => Promise<void>) {
  await page.goto('/settings/members')
  await page.getByRole('button', { name: 'Edit Sade Bakare' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sade Bakare' })
  await change(dialog)
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Sade Bakare updated')).toBeVisible()
}

test('a hotel taken away while open falls back to another, and says so', async ({
  page,
  browser,
}) => {
  const owner = await (await browser.newContext()).newPage()
  await signInAs(owner, 'adaeze')
  // As a GM, Sade sets up rooms: a page that asks for one hotel's data.
  await editSade(owner, async (dialog) => {
    await dialog.getByLabel('Role').selectOption({ label: 'General manager' })
  })

  await signInAs(page, 'sade')
  await hotelSwitch(page).selectOption({ label: 'Kora Ikeja GRA' })

  await editSade(owner, (dialog) => dialog.getByLabel('Kora Ikeja GRA').uncheck())
  await owner.context().close()

  // Her next request for Ikeja is refused; the switch reloads and falls back.
  await openMenuLink(page, 'Rates & channels')
  await expect(
    page.getByText('You no longer have access to Kora Ikeja GRA. Showing Kora Victoria Island.'),
  ).toBeVisible()
  await expect(hotelSwitch(page)).toHaveCount(0)
})

test('a shared device ignores a link to another hotel', async ({ page }) => {
  await signInAs(page, 'adaeze')
  const ikeja = await hotelId(page, 'Kora Ikeja GRA')
  await page.goto('/settings/devices')
  await page.getByRole('button', { name: 'Register this device' }).click()
  const dialog = page.getByRole('dialog', { name: 'Register this device' })
  await dialog.getByLabel('Hotel').selectOption({ label: 'Kora Victoria Island' })
  await dialog.getByLabel('Name').fill('FD-VI-09')
  await dialog.getByRole('button', { name: 'Register' }).click()
  await page
    .getByRole('dialog', { name: 'FD-VI-09 is registered' })
    .getByRole('button', { name: 'Lock this device' })
    .click()
  await page.getByRole('button', { name: /Adaeze O\./ }).click()
  for (const digit of '8391') await page.getByRole('button', { name: digit, exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()

  await page.goto(`/?hotel=${ikeja}`)
  await expect(
    page.getByText("That link is for a hotel you can't open. Showing Kora Victoria Island."),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('a link opened during a role preview is for the preview only', async ({ page }) => {
  await signInAs(page, 'adaeze')
  const abuja = await hotelId(page, 'Kora Abuja')
  const before = await page.evaluate(() => localStorage.getItem('vento.propertyId'))
  await page.getByRole('button', { name: /^Account:/ }).click()
  await page.getByRole('button', { name: 'Preview as a role' }).click()
  const dialog = page.getByRole('dialog', { name: 'Preview as a role' })
  await dialog.getByText('General manager').click()
  await dialog.getByRole('button', { name: 'Preview as General manager' }).click()
  await expect(page.getByText('Viewing as General manager.')).toBeVisible()

  await page.goto(`/?hotel=${abuja}`)
  await expect(hotelSwitch(page).locator('option:checked')).toHaveText('Kora Abuja')
  expect(await page.evaluate(() => localStorage.getItem('vento.propertyId'))).toBe(before)

  await page.getByRole('button', { name: 'Stop previewing' }).click()
  await page.reload()
  await expect(hotelSwitch(page).locator('option:checked')).toHaveText('All hotels')
})

test('with one hotel left, Members lists everyone, including people whose hotel was archived', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  await signUpOwnerWithGroup(page, `stranded-${testInfo.project.name}`)
  await page.goto('/settings/hotels')
  await page.getByRole('button', { name: 'Add a hotel' }).click()
  const add = page.getByRole('dialog', { name: 'Add a hotel' })
  await add.getByLabel('Hotel name').fill('Kora Lekki')
  await add.getByLabel('Street').fill('Plot 7 Admiralty Way')
  await add.getByLabel('Area').fill('Lekki Phase 1')
  await choose(add, 'State', 'Lagos')
  await choose(add, 'LGA', 'Eti-Osa')
  await add.getByRole('button', { name: 'Add hotel' }).click()
  await expect(page.getByText('Kora Lekki added')).toBeVisible()

  // Invited to Kora Lekki only (the hotel in view), then joins.
  const email = `stranded.${testInfo.project.name}.${Date.now()}@example.test`
  await page.goto('/settings/members')
  await page.getByRole('button', { name: 'Invite people' }).first().click()
  const invite = page.getByRole('dialog', { name: 'Invite people to Kora Lekki' })
  await invite.getByLabel('Emails').fill(email)
  await invite.getByRole('button', { name: 'Send invite' }).click()
  await expect(page.getByText(`Invite sent to ${email}`)).toBeVisible()
  const joiner = await browser.newPage()
  await joiner.goto(await linkFromEmail(email, /invited you/))
  await joiner.getByLabel('Full name').fill('Bola Ojo')
  await joiner.getByLabel('Create a password').fill('Front-desk-42!')
  await joiner.getByLabel('Confirm password', { exact: true }).fill('Front-desk-42!')
  await joiner.getByRole('button', { name: 'Accept and continue' }).click()
  await expect(joiner.getByRole('heading', { name: /^Good/ })).toBeVisible()
  await joiner.close()

  await page.goto('/settings/hotels')
  await page.getByRole('button', { name: 'Archive hotel' }).click()
  const ask = page.getByRole('dialog', { name: 'Archive Kora Lekki?' })
  await ask.getByLabel('Reason for archiving').fill('Opening postponed')
  await ask.getByRole('button', { name: 'Archive Kora Lekki' }).click()
  await expect(page.getByText('Kora Lekki archived')).toBeVisible()

  await page.goto('/settings/members')
  const row = page.getByRole('row', { name: /Bola Ojo/ })
  await expect(row).toContainText('No hotels yet')
})
