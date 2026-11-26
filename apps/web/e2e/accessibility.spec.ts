// Every page the app has, scanned for accessibility problems in light and dark mode, on desktop and
// phone (docs/UX-STANDARD.md, section 5). New pages get a line here when they're built.
import { test } from '@playwright/test'
import {
  expectAccessible,
  linkFromEmail,
  signUpOwner,
  signUpOwnerWithGroup,
  switchToDarkMode,
} from './support'

const PUBLIC_PAGES = [
  '/sign-in',
  '/get-started',
  '/forgot-password',
  '/reset-password?token=example',
  '/reset-password',
  '/a-page-that-does-not-exist',
  '/join/an-invite-link-that-does-not-work',
  '/lock',
]

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} mode`, () => {
    for (const path of PUBLIC_PAGES) {
      test(`${path} has no accessibility problems`, async ({ page }) => {
        await page.goto(path)
        if (theme === 'dark') await switchToDarkMode(page)
        await expectAccessible(page)
      })
    }

    test('check your inbox, then setup, have no accessibility problems', async ({
      page,
    }, testInfo) => {
      const email = await signUpOwner(page, `a11y-setup-${theme}-${testInfo.project.name}`)
      await expectAccessible(page)
      await page.goto(await linkFromEmail(email, /Confirm your email/))
      await page.getByLabel('Group name').waitFor()
      if (theme === 'dark') await switchToDarkMode(page)
      await expectAccessible(page)
    })

    test('team settings, invite dialog, permissions and a rule dialog have no accessibility problems', async ({
      page,
    }, testInfo) => {
      await signUpOwnerWithGroup(page, `a11y-team-${theme}-${testInfo.project.name}`)
      if (theme === 'dark') await switchToDarkMode(page)
      await page.goto('/settings/members')
      await page.getByText("It's just you so far.").waitFor()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Invite people' }).first().click()
      await expectAccessible(page)
      await page.keyboard.press('Escape')

      await page.goto('/settings/permissions')
      await page.getByRole('heading', { name: 'Permissions and limits' }).waitFor()
      // Desktop shows the grid, phones one role at a time; either way, a Front desk rule to change.
      const rule = page
        .getByRole('button', { name: /^(Front desk, Rate override|Change Rate override)/ })
        .filter({ visible: true })
        .first()
      await rule.waitFor()
      await expectAccessible(page)
      await rule.click()
      await page.getByLabel('Reason').waitFor()
      await expectAccessible(page)
    })

    test('the join page for a new person has no accessibility problems', async ({
      page,
      browser,
    }, testInfo) => {
      await signUpOwnerWithGroup(page, `a11y-join-${theme}-${testInfo.project.name}`)
      const email = `join.${theme}.${testInfo.project.name}.${Date.now()}@example.test`
      await page.goto('/settings/members')
      await page.getByRole('button', { name: 'Invite people' }).first().click()
      await page.getByLabel('Emails').fill(email)
      await page.getByRole('button', { name: 'Send invite' }).click()
      await page.getByText(`Invite sent to ${email}`).waitFor()
      const context = await browser.newContext()
      const joiner = await context.newPage()
      await joiner.goto(await linkFromEmail(email, /invited you/))
      await joiner.getByLabel('Full name').waitFor()
      if (theme === 'dark') await switchToDarkMode(joiner)
      await expectAccessible(joiner)
      await context.close()
    })

    test('home, signed in, with the account menu open, has no accessibility problems', async ({
      page,
    }, testInfo) => {
      await signUpOwnerWithGroup(page, `a11y-${theme}-${testInfo.project.name}`)
      if (theme === 'dark') await switchToDarkMode(page)
      await expectAccessible(page)
      await page.getByRole('button', { name: /^Account:/ }).click()
      await expectAccessible(page)
    })
  })
}
