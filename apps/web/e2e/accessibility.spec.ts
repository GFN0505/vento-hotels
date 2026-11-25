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
