// Shared devices and PIN sign-in (design #22, #25; decision 0022): a manager sets a PIN, registers
// the device and locks it; staff tap their name and enter their PIN. Desktop and phone.
import { expect, type Page, test } from '@playwright/test'
import { expectAccessible, PASSWORD, signUpOwnerWithGroup } from './support'

async function openSettings(page: Page, section: string) {
  const menu = page.getByRole('button', { name: 'Open menu' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: section }).click()
}

async function setPin(page: Page, pin: string) {
  await page.getByRole('button', { name: /^Account:/ }).click()
  await page.getByRole('button', { name: 'Set staff PIN' }).click()
  const dialog = page.getByRole('dialog', { name: 'Set your staff PIN' })
  await dialog.getByLabel('New PIN', { exact: true }).fill(pin)
  await dialog.getByLabel('Type the PIN again').fill(pin)
  await dialog.getByLabel('Your password', { exact: true }).fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Save PIN' }).click()
  await expect(page.getByText('Staff PIN saved')).toBeVisible()
}

async function enterPin(page: Page, pin: string) {
  for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click()
}

test('staff sign in on a registered device with a PIN, and lock it for the next person', async ({
  page,
}, testInfo) => {
  await signUpOwnerWithGroup(page, `device-${testInfo.project.name}`)
  await setPin(page, '8391')

  await openSettings(page, 'Devices')
  await expect(page.getByText('No shared devices yet')).toBeVisible()
  await page.getByRole('button', { name: 'Register this device' }).click()
  const register = page.getByRole('dialog', { name: 'Register this device' })
  await register.getByLabel('Name', { exact: true }).fill('POS-VI-03')
  await register.getByLabel("What it's for").selectOption({ label: 'Front desk PC' })
  await register.getByRole('button', { name: 'Register' }).click()
  const done = page.getByRole('dialog', { name: 'POS-VI-03 is registered' })
  await done.getByRole('button', { name: 'Lock this device' }).click()

  // The lock screen: the owner (whole group) is listed, with a PIN pad behind their name.
  await expect(page).toHaveURL(/\/lock$/)
  await expect(page.getByRole('heading', { name: 'Tap your name' })).toBeVisible()
  await expect(page.getByText('Kora Victoria Island · POS-VI-03')).toBeVisible()
  await page.getByRole('button', { name: /Adaeze O\./ }).click()
  await expect(page.getByRole('heading', { name: 'Adaeze O., enter your PIN' })).toBeVisible()
  await enterPin(page, '1111')
  await expect(page.getByRole('alert')).toHaveText('Wrong PIN. 4 tries left.')
  await enterPin(page, '8391')

  // In, confined to the device's hotel, with Lock instead of settings.
  await expect(page.getByRole('heading', { name: 'Kora Hotels Group' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Lock' }).click()
  await expect(page.getByRole('heading', { name: 'Tap your name' })).toBeVisible()

  // Signed out on a registered device: home goes to the lock screen, not email sign-in.
  await page.goto('/')
  await expect(page).toHaveURL(/\/lock$/)
})

test('a browser that is not registered says so on the lock screen', async ({ page }) => {
  await page.goto('/lock')
  await expect(page.getByRole('heading', { name: "This device isn't registered" })).toBeVisible()
  await page.getByRole('link', { name: 'Sign in with email instead' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('the lock screen, PIN pad and devices page have no accessibility problems', async ({
  page,
}, testInfo) => {
  await signUpOwnerWithGroup(page, `device-a11y-${testInfo.project.name}`)
  await setPin(page, '5172')
  await openSettings(page, 'Devices')
  await page.getByRole('button', { name: 'Register this device' }).click()
  await page.getByLabel('Name', { exact: true }).fill('HK-VI-07')
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('HK-VI-07')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Lock this device' }).click()
  await page
    .getByRole('dialog', { name: 'Lock this device?' })
    .getByRole('button', { name: 'Lock this device' })
    .click()
  await expect(page.getByRole('heading', { name: 'Tap your name' })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: /Adaeze O\./ }).click()
  await expectAccessible(page)
})
