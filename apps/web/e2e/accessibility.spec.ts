// Every page the app has, scanned for accessibility problems in light and dark mode, on desktop and
// phone (docs/UX-STANDARD.md, section 5). New pages get a line here when they're built.
import { test } from '@playwright/test'
import {
  buildRooms,
  choose,
  expectAccessible,
  linkFromEmail,
  seedDemoGroup,
  signIn,
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

    test('rooms: the builder, the page, a room, its audit trail, a room type and the builder sheet have no accessibility problems', async ({
      page,
    }, testInfo) => {
      await signUpOwnerWithGroup(page, `a11y-rooms-${theme}-${testInfo.project.name}`)
      if (theme === 'dark') await switchToDarkMode(page)
      await page.goto('/rates/rooms')
      await page.getByRole('button', { name: 'Add type' }).waitFor()
      await expectAccessible(page)
      await buildRooms(page)
      await page.getByRole('button', { name: 'Edit room 401' }).waitFor()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Edit room 401' }).click()
      await page.getByRole('dialog', { name: 'Room 401' }).waitFor()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Audit trail' }).click()
      await page.getByRole('dialog', { name: 'Audit trail' }).getByText('Room added').waitFor()
      await expectAccessible(page)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      // Phones fold the room types away until asked.
      const showTypes = page.getByRole('button', { name: 'Show 2 types' })
      if (await showTypes.isVisible()) await showTypes.click()
      await page.getByRole('button', { name: 'Edit Deluxe King' }).click()
      await page.getByRole('dialog', { name: 'Deluxe King' }).waitFor()
      await expectAccessible(page)
      await page.keyboard.press('Escape')
      // Phones keep it in the header's More menu.
      const more = page.getByRole('button', { name: 'More actions' })
      if (await more.isVisible()) {
        await more.click()
        await expectAccessible(page)
        await page.getByRole('menuitem', { name: 'Add rooms by floor' }).click()
      } else {
        await page.getByRole('button', { name: 'Add rooms by floor' }).click()
      }
      await page.getByRole('dialog', { name: 'Add rooms by floor' }).waitFor()
      await expectAccessible(page)
    })

    test('hotels and companies: settings, add a hotel, the list, archive, companies and a company have no accessibility problems', async ({
      page,
    }, testInfo) => {
      await signUpOwnerWithGroup(page, `a11y-hotels-${theme}-${testInfo.project.name}`)
      if (theme === 'dark') await switchToDarkMode(page)
      await page.goto('/settings/hotels')
      await page.getByRole('heading', { name: 'Kora Victoria Island', level: 1 }).waitFor()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Add a hotel' }).click()
      const add = page.getByRole('dialog', { name: 'Add a hotel' })
      await add.getByRole('button', { name: 'Change time zone' }).click()
      await add.getByRole('button', { name: 'Add hotel' }).click()
      await add.getByText('Enter the street').waitFor()
      // Measured at rest, not under the pointer that just pressed Add hotel.
      await page.mouse.move(0, 0)
      await expectAccessible(page)
      await add.getByLabel('Hotel name').fill('Kora Lekki')
      await add.getByLabel('Street').fill('Plot 7 Admiralty Way')
      await add.getByLabel('Area').fill('Lekki Phase 1')
      // The list open, as people see it while choosing.
      await add.getByRole('combobox', { name: 'State', exact: true }).fill('La')
      await add.getByRole('option', { name: 'Lagos', exact: true }).waitFor()
      await expectAccessible(page)
      await add.getByRole('option', { name: 'Lagos', exact: true }).click()
      await choose(add, 'LGA', 'Eti-Osa')
      await add.getByRole('button', { name: 'Add hotel' }).click()
      await page.getByRole('heading', { name: 'Next steps for Kora Lekki' }).waitFor()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Archive hotel' }).click()
      await page
        .getByRole('dialog')
        .getByText(/history and reports are kept/)
        .waitFor()
      await expectAccessible(page)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Hotels list' }).click()
      await page.getByText('Kora Hotels Group · 2 hotels').waitFor()
      await expectAccessible(page)
      await page.goto('/settings/companies')
      await page.getByText('Kora Hotels Group · 1 company').waitFor()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Kora Hospitality Ltd' }).click()
      await page.getByRole('dialog', { name: 'Kora Hospitality Ltd' }).waitFor()
      await expectAccessible(page)
    })

    test('members and devices, with All hotels and with one hotel, have no accessibility problems', async ({
      page,
    }, testInfo) => {
      const domain = seedDemoGroup(`a11y-switch-${theme}-${testInfo.project.name}`, 'Demo-pass-42!')
      await signIn(page, `adaeze@${domain}`, 'Demo-pass-42!')
      await page.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(page)
      for (const hotel of ['All hotels', 'Kora Abuja']) {
        await page.getByLabel('Hotel', { exact: true }).selectOption({ label: hotel })
        await page.goto('/settings/members')
        await page
          .getByRole('heading', { name: hotel === 'All hotels' ? 'People 11' : 'People 2' })
          .waitFor()
        await expectAccessible(page)
        await page.goto('/settings/devices')
        await page
          .getByText(hotel === 'All hotels' ? 'FD-IKJ-01' : 'No shared devices at Kora Abuja yet')
          .waitFor()
        await expectAccessible(page)
      }
      await page.goto('/rates/rooms')
      await page.getByRole('heading', { name: 'Rooms', level: 1 }).waitFor()
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
