// Room types and rooms (spec: docs/specs/stage-1-room-types-and-rooms.md): a new hotel builds its
// rooms floor by floor, marks them inspected, edits a room, filters, removes and restores; offline
// the page is read-only; front desk can't open it; a live hotel asks for a reason. Desktop and phone.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { buildRooms, signIn, signUpOwnerWithGroup } from './support'

test('a new hotel builds its rooms by floor, then edits, filters and removes them', async ({
  page,
}, testInfo) => {
  await signUpOwnerWithGroup(page, `rooms-${testInfo.project.name}`)
  await page.getByRole('link', { name: 'Set up', exact: true }).click()
  await expect(page.getByText('Describe the pattern once; Vento numbers every room.')).toBeVisible()
  await buildRooms(page)
  await expect(page.getByText('28 rooms · 2 types', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Mark 28 inspected' }).click()
  await expect(page.getByText('28 rooms marked inspected')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark 28 inspected' })).toHaveCount(0)

  // Accessible and connecting, shown on both rooms.
  await page.getByRole('button', { name: 'Edit room 401' }).click()
  const sheet = page.getByRole('dialog', { name: 'Room 401' })
  await sheet.getByLabel('Accessible').check()
  await sheet.getByLabel('Connecting rooms').fill('402')
  await sheet.getByRole('button', { name: 'Add connecting room' }).click()
  await expect(sheet.getByText('402', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Save room' }).click()
  await expect(page.getByText('Room 401 saved')).toBeVisible()
  await expect(
    page
      .getByText(/Accessible · connecting 402/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible()
  await expect(
    page
      .getByText(/connecting 401/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible()

  await page.getByRole('button', { name: /^Accessible/ }).click()
  await expect(page.getByRole('button', { name: /^Edit room/ })).toHaveCount(1)
  await page.getByLabel('Room number').fill('999')
  await expect(page.getByText('No rooms match these filters.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('button', { name: /^Edit room/ })).toHaveCount(28)

  // Before go-live, removing needs no reason and can be undone; archived rooms can be restored.
  await page.getByLabel('Select room 313').check()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByText('Room 313 removed')).toBeVisible()
  await page.getByRole('button', { name: /^Archived/ }).click()
  await expect(page.getByRole('button', { name: 'Restore room 313' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore room 313' }).click()
  await expect(page.getByText('Room 313 restored')).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Set up', exact: true })).toHaveCount(0)
})

test('select every room in a view, move with the keyboard, and read a room’s audit trail', async ({
  page,
}, testInfo) => {
  // Two builds and 112 rooms: longer than the default on a phone.
  test.setTimeout(90_000)
  await signUpOwnerWithGroup(page, `rooms-select-${testInfo.project.name}`)
  await page.goto('/rates/rooms')
  await buildRooms(page)

  // A second block, from the sheet: it starts on the next free floor with the type added last.
  const more = page.getByRole('button', { name: 'More actions' })
  if (await more.isVisible()) {
    await more.click()
    await page.getByRole('menuitem', { name: 'Add rooms by floor' }).click()
  } else {
    await page.getByRole('button', { name: 'Add rooms by floor' }).click()
  }
  const builder = page.getByRole('dialog', { name: 'Add rooms by floor' })
  await expect(builder.getByLabel('First floor, line 1')).toHaveValue('5')
  await expect(builder.getByLabel('Line 1 · Room type')).toHaveValue(/.+/)
  await builder.getByLabel('Last floor, line 1').fill('10')
  await builder.getByLabel('Last number, line 1').fill('14')
  await builder.getByRole('button', { name: 'Create 84 rooms' }).click()
  await expect(page.getByText('84 rooms created at Kora Victoria Island')).toBeVisible()

  // Tick the page, then every room in the view, and move them all in one go.
  await page
    .getByLabel(/^Select all (rooms )?on this page$/)
    .filter({ visible: true })
    .check()
  await page.getByRole('button', { name: 'Select all 112 rooms in this view' }).click()
  await expect(page.getByText('All 112 rooms in this view are selected.')).toBeVisible()
  await page.getByRole('button', { name: 'Change type' }).filter({ visible: true }).click()
  const change = page.getByRole('dialog', { name: 'Change type of 112 rooms' })
  await change.getByLabel('New room type').selectOption({ label: 'Standard Queen' })
  await change.getByRole('button', { name: 'Change type' }).click()
  await expect(page.getByText('112 rooms moved to Standard Queen')).toBeVisible()

  // One tab stop for the list: arrows move, Space ticks, Enter opens.
  await page.getByRole('row', { name: /Edit room 301/ }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('row', { name: /Edit room 302/ })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByLabel('Select room 302')).toBeChecked()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Room 302' })).toBeVisible()
  await page.keyboard.press('Escape')

  // The audit trail says what changed, in words.
  await page.getByRole('button', { name: 'Edit room 401' }).click()
  await page
    .getByRole('dialog', { name: 'Room 401' })
    .getByRole('button', { name: 'Audit trail' })
    .click()
  const trail = page.getByRole('dialog', { name: 'Audit trail' })
  await expect(trail.getByText('Type: Deluxe King → Standard Queen')).toBeVisible()
  await expect(trail.getByText('Room added')).toBeVisible()
  await expect(trail.getByText('Added by floor with other rooms, in one go')).toBeVisible()
})

test('offline, the rooms page is read-only', async ({ page, context }, testInfo) => {
  await signUpOwnerWithGroup(page, `rooms-offline-${testInfo.project.name}`)
  await page.goto('/rates/rooms')
  await buildRooms(page)
  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByText('Needs a connection').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add room type' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Edit room 301' })).toBeVisible()
  await context.setOffline(false)
})

test.describe('on the demo group', () => {
  const PASSWORD = 'Demo-pass-42!'
  let domain = ''
  // biome-ignore lint/correctness/noEmptyPattern: Playwright needs the fixtures argument destructured.
  test.beforeAll(({}, testInfo) => {
    const run = `rooms-${testInfo.project.name}-${Date.now().toString(36)}`
    domain = `kora-${run}.example`
    execFileSync('node', [fileURLToPath(new URL('../../api/src/seed/cli.ts', import.meta.url))], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        DEMO_PASSWORD: PASSWORD,
        DEMO_SLUG: `kora-${run}`,
        DEMO_EMAIL_DOMAIN: domain,
      },
      stdio: 'pipe',
    })
  })

  test('front desk has no Rooms page', async ({ page }) => {
    await signIn(page, `chiamaka@${domain}`, PASSWORD)
    await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()
    await page.goto('/rates/rooms')
    await expect(
      page.getByText('Only a GM or the owner can set up rooms. Ask your GM.'),
    ).toBeVisible()
  })

  test('the owner picks a hotel; a live hotel asks why a room is removed', async ({ page }) => {
    await signIn(page, `adaeze@${domain}`, PASSWORD)
    await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()
    await page.goto('/rates/rooms')
    await expect(page.getByText('Rooms are set up per hotel. Pick a hotel.')).toBeVisible()
    await page.getByRole('button', { name: /Kora Victoria Island/ }).click()
    await expect(page.getByText('120 rooms · 4 types', { exact: true })).toBeVisible()
    // 1014, the last Deluxe King: the demo's stays this week are in lower rooms (brick 7 refuses to
    // remove a room with a booking).
    await page.getByLabel('Room number').fill('1014')
    await page.getByRole('button', { name: 'Edit room 1014' }).click()
    await page
      .getByRole('dialog', { name: 'Room 1014' })
      .getByRole('button', { name: 'Remove', exact: true })
      .click()
    const ask = page.getByRole('dialog', { name: 'Remove Room 1014?' })
    await ask.getByRole('button', { name: 'Remove Room 1014' }).click()
    await expect(ask.getByText('Say why, in a few words')).toBeVisible()
    await ask.getByLabel('Reason for removing Room 1014').fill('Converted to a store')
    await ask.getByRole('button', { name: 'Remove Room 1014' }).click()
    await expect(page.getByText('Room 1014 removed')).toBeVisible()
  })
})
