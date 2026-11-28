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

    test('rates: the first rate, the plans, the editor, the calendar and Change dates have no accessibility problems', async ({
      page,
    }, testInfo) => {
      await signUpOwnerWithGroup(page, `a11y-rates-${theme}-${testInfo.project.name}`)
      if (theme === 'dark') await switchToDarkMode(page)
      await page.goto('/rates/rooms')
      await buildRooms(page)
      await page.goto('/rates/plans')
      await page.getByRole('heading', { name: 'Your first rate' }).waitFor()
      await expectAccessible(page)
      await page.getByLabel('Standard Queen, weekday price').fill('120000')
      await page.getByLabel('Deluxe King, weekday price').fill('150000')
      await page.getByRole('button', { name: 'Create Best available' }).click()
      await page.getByRole('link', { name: 'Bed & breakfast', exact: true }).waitFor()
      await expectAccessible(page)
      await page.getByRole('link', { name: 'Bed & breakfast', exact: true }).click()
      await page.getByRole('heading', { name: 'Rate plan · Bed & breakfast' }).waitFor()
      await page.getByText('Plan created').waitFor()
      await expectAccessible(page)
      await page.goto('/rates/calendar')
      await page.getByRole('heading', { name: 'Rate calendar', level: 1 }).waitFor()
      await page
        .getByRole('button', { name: /^Standard Queen, Best available, / })
        .filter({ visible: true })
        .first()
        .waitFor()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Change dates' }).click()
      await page.getByRole('dialog', { name: 'Change dates · Best available' }).waitFor()
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

    test('taxes and charges, payments and FX rates, with their sheets, have no accessibility problems', async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000)
      const domain = seedDemoGroup(
        `a11y-finance-${theme}-${testInfo.project.name}`,
        'Demo-pass-42!',
      )
      await signIn(page, `kunle@${domain}`, 'Demo-pass-42!')
      await page.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(page)
      await page
        .getByLabel('Hotel', { exact: true })
        .selectOption({ label: 'Kora Victoria Island' })
      await page.goto('/settings/taxes')
      await page.getByRole('heading', { name: 'How a bill adds up' }).waitFor()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Schedule a change' }).first().click()
      await page.getByLabel('Source').waitFor()
      await expectAccessible(page)
      await page.keyboard.press('Escape')

      await page.goto('/settings/payments')
      await page.getByRole('heading', { name: 'POS terminals' }).waitFor()
      await page.getByText('Moniepoint · Desk 1').first().waitFor()
      await expectAccessible(page)
      await page.getByText('Zenith Bank · ••••4471 · NGN').click()
      await page.getByLabel('Account number').waitFor()
      await expectAccessible(page)
      await page.keyboard.press('Escape')

      await page.goto('/settings/fx-rates')
      await page.getByRole('heading', { name: 'History' }).waitFor()
      await expectAccessible(page)

      await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'All hotels' })
      await page.goto('/settings/taxes')
      await page.getByText('Taxes are set per hotel. Pick a hotel.').waitFor()
      await expectAccessible(page)
    })

    test('taxes with nothing set up has no accessibility problems', async ({ page }, testInfo) => {
      await signUpOwnerWithGroup(page, `a11y-taxes-${theme}-${testInfo.project.name}`)
      if (theme === 'dark') await switchToDarkMode(page)
      await page.goto('/settings/taxes')
      await page.getByText('No taxes set up').waitFor()
      await expectAccessible(page)
    })

    test('members and devices, with All hotels and with one hotel, have no accessibility problems', async ({
      page,
    }, testInfo) => {
      // Seeds the whole demo group, which grows with every brick, then checks eight pages.
      test.setTimeout(120_000)
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
      // Rates on a live hotel, read as the owner, and the plans with All hotels (Pick a hotel).
      await page.goto('/rates/plans')
      await page.getByRole('link', { name: 'Best available', exact: true }).waitFor()
      await expectAccessible(page)
      await page.goto('/rates/calendar')
      await page.getByRole('heading', { name: 'Rate calendar', level: 1 }).waitFor()
      await page
        .getByRole('button', { name: /^Standard Queen, Best available, / })
        .filter({ visible: true })
        .first()
        .waitFor()
      await expectAccessible(page)
      await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'All hotels' })
      await page.getByText('Rates are set per hotel. Pick a hotel.').waitFor()
      await expectAccessible(page)
    })

    test('reservations: the list (All hotels, one hotel, empty), a reservation and New reservation at Room & rate and Review have no accessibility problems', async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000)
      const domain = seedDemoGroup(`a11y-res-${theme}-${testInfo.project.name}`, 'Demo-pass-42!')
      await signIn(page, `adaeze@${domain}`, 'Demo-pass-42!')
      await page.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(page)
      await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'All hotels' })
      await page.goto('/reservations')
      await page.getByRole('columnheader', { name: 'Hotel' }).waitFor()
      await expectAccessible(page)
      await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'Kora Abuja' })
      await page.getByText(/^No reservations at Kora Abuja yet/).waitFor()
      await expectAccessible(page)
      await page
        .getByLabel('Hotel', { exact: true })
        .selectOption({ label: 'Kora Victoria Island' })
      await page
        .getByRole('link', { name: /Daniel Mensah/ })
        .first()
        .click()
      await page.getByRole('heading', { name: 'Rate per night' }).waitFor()
      await expectAccessible(page)
      await page.goto('/reservations?sheet=new')
      const sheet = page.getByRole('dialog', { name: 'New reservation' })
      // The wedding's nights (seed): Junior Suite sold out on one of them.
      const day = (offset: number) =>
        new Date(
          Date.parse(
            `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())}T00:00:00Z`,
          ) +
            offset * 86_400_000,
        )
          .toISOString()
          .slice(0, 10)
      await sheet.getByLabel('Arrival').fill(day(15))
      await sheet.getByLabel('Departure').fill(day(17))
      await sheet.getByLabel('Adults').fill('1')
      await sheet.getByRole('button', { name: /^Continue/ }).click()
      await sheet.getByText('Left per night').first().waitFor()
      const show = sheet.getByRole('button', { name: /^Show .* for / }).first()
      if (await show.isVisible()) await show.click()
      await sheet
        .getByText(/^Sold out/)
        .first()
        .waitFor()
      await sheet
        .getByRole('radio', { name: /total for the stay/ })
        .first()
        .check()
      await sheet.getByText('Deposit due').or(sheet.getByText('No deposit')).first().waitFor()
      await expectAccessible(page)
      await sheet.getByRole('button', { name: 'Continue to guest' }).click()
      await sheet.getByLabel('First name').fill('Sarah')
      await sheet.getByLabel('Last name').fill('Collins')
      await sheet.getByRole('textbox', { name: 'Phone', exact: true }).fill('08031234567')
      await sheet.getByRole('button', { name: 'Continue to review' }).click()
      await sheet.getByRole('heading', { name: 'Review & book' }).waitFor()
      await expectAccessible(page)
    })

    test('approvals: the bell, Waiting, Asked by you, Done and a request have no accessibility problems', async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000)
      const domain = seedDemoGroup(`a11y-appr-${theme}-${testInfo.project.name}`, 'Demo-pass-42!')
      await signIn(page, `tunde@${domain}`, 'Demo-pass-42!')
      await page.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(page)
      await page.getByRole('button', { name: /^Approvals, / }).click()
      await page
        .getByRole('region', { name: 'Notifications' })
        .getByText("You're all caught up.")
        .waitFor()
      await expectAccessible(page)
      await page.goto('/approvals')
      await page.getByText(/^Nothing waiting for you\. Approvals your team asks you for/).waitFor()
      await expectAccessible(page)
      await page.goto('/approvals?view=asked')
      await page.getByText(/^You haven't asked for any approvals today/).waitFor()
      await expectAccessible(page)
      // Done: the seed's declined, expired and approved requests; desktop opens the first.
      await page.goto('/approvals?view=done')
      await page.getByRole('button', { name: /Discount 18% · Ifeoma Chukwu/ }).click()
      await page.getByRole('article', { name: 'Discount 18% · Ifeoma Chukwu' }).waitFor()
      await expectAccessible(page)
    })

    test('modify, cancel and no-show: the Modify dialog with a late change, Cancel (free, with a penalty, with a waiver), Mark no-show and a cancelled reservation with its Penalty card have no accessibility problems', async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000)
      const domain = seedDemoGroup(`a11y-change-${theme}-${testInfo.project.name}`, 'Demo-pass-42!')
      await signIn(page, `chiamaka@${domain}`, 'Demo-pass-42!')
      await page.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(page)
      const open = async (guest: string) => {
        await page.goto('/reservations?view=all')
        await page.getByRole('searchbox').fill(guest)
        await page.getByRole('link', { name: guest }).first().click()
        await page.getByRole('heading', { name: guest }).waitFor()
      }
      // Free cancellation: Nkechi Ude arrives in five days.
      await open('Nkechi Ude')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      const free = page.getByRole('dialog', { name: /^Cancel reservation · / })
      await free
        .getByText(/No penalty$/)
        .first()
        .waitFor()
      await expectAccessible(page)
      await free.getByRole('button', { name: 'Keep booking' }).click()
      // Inside the penalty window, then with Waive the penalty ticked.
      await open('Kelechi Obi')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      const late = page.getByRole('dialog', { name: /^Cancel reservation · / })
      await late.getByText(/^First night · ₦/).waitFor()
      await expectAccessible(page)
      await late.getByText('Waive the penalty').click()
      await late.getByLabel('Reason for waiving').fill('Regular guest')
      await expectAccessible(page)
      await late.getByRole('button', { name: 'Keep booking' }).click()
      // Modify with a late change: one night shorter after the deadline.
      await page.getByRole('button', { name: /^Modify/ }).click()
      const modify = page.getByRole('dialog', { name: /^Modify reservation · / })
      const leave = modify.getByLabel('Leave')
      const departure = await leave.inputValue()
      const shorter = new Date(Date.parse(`${departure}T00:00:00Z`) - 86_400_000)
        .toISOString()
        .slice(0, 10)
      await leave.fill(shorter)
      await modify.getByText(/so a penalty of ₦.* applies\.$/).waitFor()
      await expectAccessible(page)
      await modify.getByRole('button', { name: /^Cancel/ }).click()
      // Mark no-show: Grace Eboh arrives today.
      await open('Grace Eboh')
      await page.getByRole('button', { name: 'More: no-show' }).click()
      await page.getByRole('menuitem', { name: 'Mark no-show' }).click()
      await page
        .getByRole('dialog', { name: /^Mark no-show · / })
        .getByText("Mark a no-show only when the guest won't arrive tonight.")
        .waitFor()
      await expectAccessible(page)
      await page.keyboard.press('Escape')
      // A cancelled reservation with its penalty to charge.
      await open('Folake Ogun')
      await page.getByRole('heading', { name: 'Penalty' }).waitFor()
      await expectAccessible(page)
    })

    test('tape chart: the chart, an open Unassigned lane, a bar card, Room move (same type and keeping the price), the extend popover, Out of order with a refusal, the room menu and the phone day list have no accessibility problems', async ({
      page,
      isMobile,
    }, testInfo) => {
      test.setTimeout(150_000)
      const domain = seedDemoGroup(`a11y-chart-${theme}-${testInfo.project.name}`, 'Demo-pass-42!')
      await signIn(page, `tunde@${domain}`, 'Demo-pass-42!')
      await page.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(page)
      await page.goto('/tape-chart')
      await page.getByRole('heading', { name: 'Tape chart' }).waitFor()
      if (isMobile) {
        await page.getByText('Business date', { exact: true }).waitFor()
        await expectAccessible(page)
        await page.getByRole('button', { name: /^502 / }).click()
        await page.getByRole('dialog', { name: 'Room 502' }).waitFor()
        await expectAccessible(page)
        return
      }
      await page.getByLabel('Room type').selectOption({ label: 'Deluxe King' })
      await expectAccessible(page)
      await page
        .getByRole('button', { name: /^Unassigned/, expanded: false })
        .first()
        .click()
      await page
        .getByRole('button', { name: /Funmilayo Adebayo, Deluxe King/ })
        .first()
        .waitFor()
      await expectAccessible(page)
      // The bar card, then Room move for the same type and with the Keep rate line.
      await page.getByRole('button', { name: /Ngozi Okafor, Deluxe King/ }).click()
      const card = page.getByRole('dialog', { name: /^Ngozi Okafor · VI-/ })
      await expectAccessible(page)
      await card.getByRole('button', { name: /^Room move/ }).click()
      const move = page.getByRole('dialog', { name: 'Room move · Ngozi Okafor' })
      await move.getByRole('radio', { name: /^401 Deluxe King/ }).waitFor()
      await expectAccessible(page)
      await move.getByRole('button', { name: /^Cancel/ }).click()
      // Deluxe King full on Mr Eze's second night: the upgrade with the Keep rate line.
      await page.getByRole('button', { name: /Chidi Eze, Deluxe King/ }).click()
      await page
        .getByRole('dialog', { name: /^Chidi Eze · VI-/ })
        .getByRole('button', { name: /^Room move/ })
        .click()
      const upgrade = page.getByRole('dialog', { name: 'Room move · Chidi Eze' })
      await upgrade
        .getByRole('radio', { name: /Executive King/ })
        .first()
        .check()
      await upgrade.getByRole('radio', { name: /^Keep ₦168,000\.00 a night/ }).check()
      await upgrade.getByText(/discount on Executive King/).waitFor()
      await expectAccessible(page)
      await upgrade.getByRole('button', { name: /^Cancel/ }).click()
      // The extend popover, by keyboard-free drag of Mr Mensah's bar end.
      await page.getByLabel('Room type').selectOption({ label: 'Executive King' })
      const mensah = page.getByRole('button', { name: /Daniel Mensah, Executive King/ })
      await mensah.scrollIntoViewIfNeeded()
      const bar = await mensah.boundingBox()
      if (!bar) throw new Error('no bar')
      await page.mouse.move(bar.x + bar.width - 3, bar.y + bar.height / 2)
      await page.mouse.down()
      await page.mouse.move(bar.x + bar.width + 10, bar.y + bar.height / 2, { steps: 4 })
      await page.mouse.move(bar.x + bar.width + (bar.width * 2) / 3, bar.y + bar.height / 2, {
        steps: 8,
      })
      await page.mouse.up()
      await page
        .getByRole('dialog', { name: /^Extend Daniel Mensah to/ })
        .getByText('Added to stay')
        .waitFor()
      await expectAccessible(page)
      await page.keyboard.press('Escape')
      // The room menu, then Out of order refused for a room with a booking.
      await page.getByRole('button', { name: /^Room 501 / }).click()
      await page.getByRole('button', { name: 'Put out of order' }).waitFor()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Put out of order' }).click()
      const ooo = page.getByRole('dialog', { name: 'Put 501 out of order' })
      await ooo.getByText(/Move the booking first\.$/).waitFor()
      await expectAccessible(page)
    })

    test('cash: the open form with a hand-over difference, My shift, the blind count, the submit confirm, the submitted step, Shifts, a shift sheet and the Cash drawers card have no accessibility problems', async ({
      page,
      browser,
    }, testInfo) => {
      test.setTimeout(150_000)
      const domain = seedDemoGroup(`a11y-cash-${theme}-${testInfo.project.name}`, 'Demo-pass-42!')
      // Tunde has no shift: the open form, Desk 1 busy with Chiamaka's shift, Desk 2 free.
      await signIn(page, `tunde@${domain}`, 'Demo-pass-42!')
      await page.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(page)
      await page.goto('/cash')
      await page.getByRole('heading', { name: 'Open cashier shift' }).waitFor()
      await expectAccessible(page)
      await page.getByLabel('Notes of ₦1,000').fill('12')
      await page.getByLabel('Reason for the difference').waitFor()
      await expectAccessible(page)
      await page.goto('/cash/shifts')
      await page.getByRole('heading', { name: 'Shifts', exact: true }).waitFor()
      await expectAccessible(page)
      await page
        .getByRole('button', { name: /^Shift 3 · / })
        .first()
        .click()
      await page.getByText('To the safe · bag S-2210').waitFor()
      await expectAccessible(page)
      await page.keyboard.press('Escape')
      // Chiamaka's open shift, counted blind and submitted.
      const context = await browser.newContext()
      const desk = await context.newPage()
      await signIn(desk, `chiamaka@${domain}`, 'Demo-pass-42!')
      await desk.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(desk)
      await desk.goto('/cash')
      await desk.getByRole('button', { name: 'Count and close' }).waitFor()
      await expectAccessible(desk)
      await desk.getByRole('button', { name: 'Count and close' }).click()
      await desk.getByLabel('Notes of ₦1,000').fill('47')
      await desk.getByLabel(/^POS terminal · Moniepoint · Desk 1/).fill('0')
      await desk.getByLabel('Bank transfers').fill('0')
      await expectAccessible(desk)
      await desk.getByRole('button', { name: 'Submit count' }).click()
      await desk.getByRole('dialog', { name: 'Submit your count?' }).waitFor()
      await expectAccessible(desk)
      await desk
        .getByRole('dialog', { name: 'Submit your count?' })
        .getByRole('button', { name: 'Submit count' })
        .click()
      await desk.getByText('Cash ₦3,000.00 short').waitFor()
      await expectAccessible(desk)
      await context.close()
      // Kunle: Settings › Payments with the Cash drawers card.
      const finance = await browser.newContext()
      const kunle = await finance.newPage()
      await signIn(kunle, `kunle@${domain}`, 'Demo-pass-42!')
      await kunle.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(kunle)
      await kunle.goto('/settings/payments')
      await kunle
        .getByRole('heading', {
          name: /^(Cash drawers|Payments are set per hotel\. Pick a hotel\.)$/,
        })
        .first()
        .waitFor()
      const pick = kunle.getByRole('button', { name: /^Kora Victoria Island/ })
      if (await pick.isVisible()) await pick.click()
      await kunle.getByRole('heading', { name: 'Cash drawers' }).waitFor()
      await kunle.getByText(/^Shift 1 open · Chiamaka Eze$/).waitFor()
      await expectAccessible(kunle)
      await finance.close()
    })

    test('the plan editor preview with Guest pays has no accessibility problems', async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000)
      const domain = seedDemoGroup(`a11y-pays-${theme}-${testInfo.project.name}`, 'Demo-pass-42!')
      await signIn(page, `tunde@${domain}`, 'Demo-pass-42!')
      await page.getByRole('heading', { name: /^Good/ }).waitFor()
      if (theme === 'dark') await switchToDarkMode(page)
      await page.goto('/rates/plans')
      await page.getByRole('link', { name: 'Bed & breakfast', exact: true }).click()
      await page
        .getByText(/^Guest pays/)
        .first()
        .waitFor()
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
