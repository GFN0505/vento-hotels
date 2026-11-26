// The app shell (Shell components · Sidebar): every module in the menu by role, module pages until
// they ship, and owners previewing the app as another role. Desktop and phone.
import { expect, type Page, test } from '@playwright/test'
import { expectAccessible, signUpOwnerWithGroup } from './support'

async function openMenu(page: Page) {
  const menu = page.getByRole('button', { name: 'Open menu' })
  if (await menu.isVisible()) await menu.click()
  return page.getByRole('navigation', { name: 'Main' }).filter({ visible: true })
}

test('owners see every module, and a module page says what it will do', async ({
  page,
}, testInfo) => {
  await signUpOwnerWithGroup(page, `shell-${testInfo.project.name}`)
  const nav = await openMenu(page)
  for (const label of [
    'Reservations',
    'Tape chart',
    'Rates & channels',
    'Restaurant & bar',
    'Finance',
    'Leakage',
    'Settings',
  ]) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible()
  }
  await nav.getByRole('link', { name: 'Restaurant & bar' }).click()
  await expect(page.getByRole('heading', { name: 'Restaurant & bar' })).toBeVisible()
  await expect(page.getByText('Not available yet. Planned for stage 3.')).toBeVisible()
  await expectAccessible(page)
})

test('an owner previews the app as a waiter, then goes back', async ({ page }, testInfo) => {
  await signUpOwnerWithGroup(page, `preview-${testInfo.project.name}`)
  await page.getByRole('button', { name: /^Account:/ }).click()
  await page.getByRole('button', { name: 'Preview as a role' }).click()
  const dialog = page.getByRole('dialog', { name: 'Preview as a role' })
  await dialog.getByText('Waiter / bartender').click()
  await dialog.getByRole('button', { name: 'Preview as Waiter / bartender' }).click()

  await expect(page.getByText('Viewing as Waiter / bartender.')).toBeVisible()
  await expectAccessible(page)
  const nav = await openMenu(page)
  await expect(nav.getByRole('link', { name: 'Restaurant & bar' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Reservations' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0)
  const close = page.getByRole('button', { name: 'Close menu' })
  if (await close.isVisible()) await close.click()

  // A page the waiter doesn't use says so.
  await page.goto('/finance')
  await expect(
    page.getByRole('heading', { name: "You don't have access to Finance" }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Stop previewing' }).click()
  await expect(page.getByText('Viewing as Waiter / bartender.')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible()
})

test('an unknown section is a plain not-found page', async ({ page }, testInfo) => {
  await signUpOwnerWithGroup(page, `shell-404-${testInfo.project.name}`)
  await page.goto('/nonsense-section')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})
