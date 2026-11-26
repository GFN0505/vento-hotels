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
  await expect(page.getByText('Kora Victoria Island · 28 rooms · 2 types')).toBeVisible()

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
  await expect(page.getByText('Accessible · connecting 402')).toBeVisible()
  await expect(page.getByText('connecting 401', { exact: true })).toBeVisible()

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
    await expect(page.getByText('Kora Victoria Island · 120 rooms · 4 types')).toBeVisible()
    await page.getByLabel('Room number').fill('412')
    await page.getByRole('button', { name: 'Edit room 412' }).click()
    await page
      .getByRole('dialog', { name: 'Room 412' })
      .getByRole('button', { name: 'Remove', exact: true })
      .click()
    const ask = page.getByRole('dialog', { name: 'Remove Room 412?' })
    await ask.getByRole('button', { name: 'Remove Room 412' }).click()
    await expect(ask.getByText('Say why, in a few words')).toBeVisible()
    await ask.getByLabel('Reason for removing Room 412').fill('Converted to a store')
    await ask.getByRole('button', { name: 'Remove Room 412' }).click()
    await expect(page.getByText('Room 412 removed')).toBeVisible()
  })
})
