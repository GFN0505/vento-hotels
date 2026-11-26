// The owner brings their team in (design #25, #24 and #26): invite, join from the email in one
// step, change role and hotels, remove, and change a limit with a reason. Desktop and phone.
import { expect, type Page, test } from '@playwright/test'
import { linkFromEmail, signUpOwnerWithGroup } from './support'

const JOINER_PASSWORD = 'Front-desk-42!'

async function openMembers(page: Page) {
  // On phones the sidebar is behind the menu button.
  const menu = page.getByRole('button', { name: 'Open menu' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Members and roles' })).toBeVisible()
}

test('the owner invites a front desk agent, who joins from the email in one step', async ({
  page,
  browser,
}, testInfo) => {
  await signUpOwnerWithGroup(page, `team-${testInfo.project.name}`)
  await openMembers(page)
  await expect(page.getByText("It's just you so far.")).toBeVisible()

  const email = `ada.${testInfo.project.name}.${Date.now()}@example.test`
  await page.getByRole('button', { name: 'Invite people' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Invite people' })
  await dialog.getByLabel('Emails').fill(email)
  await dialog.getByLabel('Role').selectOption({ label: 'Front desk' })
  // One hotel in the group so far, so there's no hotel choice to make.
  await expect(dialog.getByText('Can see')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Send invite' }).click()
  await expect(page.getByText(`Invite sent to ${email}`)).toBeVisible()
  await expect(page.getByRole('region', { name: /Invited/ })).toContainText(email)

  // Ada opens the link in her own browser: no account yet, so she sets a name and password.
  const link = await linkFromEmail(email, /invited you to Kora Hotels Group/)
  const ada = await browser.newPage()
  await ada.goto(link)
  await expect(ada.getByRole('heading', { name: 'Join Kora Hotels Group' })).toBeVisible()
  await expect(ada.getByText(/invited you as Front desk across Kora Hotels Group/)).toBeVisible()
  await ada.getByLabel('Full name').fill('Ada Nwosu')
  await ada.getByLabel('Create a password').fill(JOINER_PASSWORD)
  await ada.getByLabel('Confirm password', { exact: true }).fill(JOINER_PASSWORD)
  await ada.getByRole('button', { name: 'Accept and continue' }).click()
  await expect(
    ada.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible()
  // Front desk doesn't manage people, so Settings isn't offered.
  await expect(ada.getByRole('link', { name: 'Settings' })).toHaveCount(0)

  // The link can't be used twice.
  const again = await browser.newPage()
  await again.goto(link)
  await expect(again.getByRole('heading', { name: "This invite can't be used" })).toBeVisible()
  await again.close()
  await ada.close()

  // The owner sees her, changes her role, then removes her.
  await page.reload()
  const row = page.getByRole('row', { name: /Ada Nwosu/ })
  await expect(row).toContainText('Front desk')
  await row.getByRole('button', { name: 'Edit Ada Nwosu' }).click()
  const edit = page.getByRole('dialog', { name: 'Ada Nwosu' })
  await edit.getByLabel('Role').selectOption({ label: 'Cashier' })
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Ada Nwosu updated')).toBeVisible()
  await expect(row).toContainText('Cashier')

  await row.getByRole('button', { name: 'Edit Ada Nwosu' }).click()
  await page.getByRole('button', { name: 'Remove from group' }).click()
  const confirm = page.getByRole('dialog', { name: 'Remove Ada Nwosu from Kora Hotels Group?' })
  await confirm.getByRole('button', { name: 'Remove from group' }).click()
  await expect(page.getByText('Ada Nwosu removed from Kora Hotels Group')).toBeVisible()
  await expect(page.getByRole('row', { name: /Ada Nwosu/ })).toHaveCount(0)
})

test('invite emails are checked before sending', async ({ page }, testInfo) => {
  await signUpOwnerWithGroup(page, `team-check-${testInfo.project.name}`)
  await openMembers(page)
  await expect(page.getByText("It's just you so far.")).toBeVisible()
  await page.getByRole('button', { name: 'Invite people' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Invite people' })
  // The emails box has focus as soon as the dialog opens, ready to type or paste.
  await expect(dialog.getByLabel('Emails')).toBeFocused()
  await dialog.getByRole('button', { name: 'Send invite' }).click()
  await expect(dialog.getByText('Enter at least one email')).toBeVisible()
  await expect(dialog.getByLabel('Emails')).toBeFocused()
  await dialog.getByLabel('Emails').fill('ada@korahotels.ng, not-an-email')
  // Only valid addresses are counted.
  await dialog.getByRole('button', { name: 'Send invite' }).click()
  await expect(
    dialog.getByText("not-an-email isn't a valid email address. Fix or remove it."),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('the owner changes a limit with a reason', async ({ page }, testInfo) => {
  await signUpOwnerWithGroup(page, `perm-${testInfo.project.name}`)
  await openMembers(page)
  await page.getByRole('link', { name: 'Permissions and limits' }).click()
  await expect(page.getByRole('heading', { name: 'Permissions and limits' })).toBeVisible()

  // Phones show one role at a time; desktop can switch to that view too.
  const byRole = page.getByRole('button', { name: 'By role' })
  if (await byRole.isVisible()) await byRole.click()
  await page.getByLabel('Role').selectOption({ label: 'Front desk' })
  await page
    .getByRole('button', { name: 'Change Rate override / discount on a stay for Front desk' })
    .click()
  const dialog = page.getByRole('dialog', { name: /Front desk: Rate override/ })
  await expect(dialog).toContainText("Vento's default for front desk: allowed up to 10%.")
  await dialog.getByLabel('Up to (%)').fill('15')
  await dialog.getByRole('button', { name: 'Save rule' }).click()
  await expect(dialog.getByText('Say why this is changing')).toBeVisible()
  await dialog.getByLabel('Reason').fill('Weekend promotions need a little more room')
  await dialog.getByRole('button', { name: 'Save rule' }).click()
  await expect(dialog).toBeHidden()
  const row = page
    .getByRole('region', { name: 'Front office' })
    .getByRole('listitem')
    .filter({ hasText: 'Rate override / discount on a stay' })
  await expect(row).toContainText('≤15%')
  await expect(row).toContainText('Changed')
})
