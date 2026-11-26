// Home by role and hotel, on the demo group (docs/journeys/README.md): the owner starts on the whole
// group and opens one hotel's day in a click; front desk and housekeeping land on their own hotel,
// with their own figures; group finance leads with money. Desktop and phone.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { expectAccessible, signIn } from './support'

const PASSWORD = 'Demo-pass-42!'
let domain = ''

// biome-ignore lint/correctness/noEmptyPattern: Playwright needs the fixtures argument destructured.
test.beforeAll(({}, testInfo) => {
  // Each project loads its own copy of the group, so parallel runs never collide.
  const run = `${testInfo.project.name}-${Date.now().toString(36)}`
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

const greeting = /^Good (morning|afternoon|evening)/

test('the owner sees the group, opens a hotel, and goes back to all hotels', async ({ page }) => {
  await signIn(page, `adaeze@${domain}`, PASSWORD)
  await expect(page.getByRole('heading', { name: greeting })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Across the group' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Open Kora/ })).toHaveCount(4)
  await expect(page.getByLabel('Hotel', { exact: true })).toHaveValue('all')
  await expectAccessible(page)

  await page.getByRole('button', { name: /^Open Kora Ikeja GRA/ }).click()
  await expect(page.getByRole('heading', { name: 'Today at Kora Ikeja GRA' })).toBeVisible()
  await expect(page.getByText('Owner · Kora Ikeja GRA')).toBeVisible()
  await expectAccessible(page)

  // The choice is remembered on this device.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today at Kora Ikeja GRA' })).toBeVisible()

  await page.getByRole('button', { name: 'All hotels' }).click()
  await expect(page.getByRole('heading', { name: 'Across the group' })).toBeVisible()
})

test('front desk lands on their hotel, with no group view', async ({ page }) => {
  await signIn(page, `chiamaka@${domain}`, PASSWORD)
  await expect(page.getByRole('heading', { name: greeting })).toBeVisible()
  await expect(page.getByText('Front desk · Kora Victoria Island')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Today at Kora Victoria Island' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Arrivals/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New reservation' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'All hotels' })).toHaveCount(0)
  await expect(page.getByLabel('Hotel', { exact: true })).toHaveCount(0)
  // Setup prompts are for the people who run the setup.
  await expect(page.getByText(/invite not accepted/)).toHaveCount(0)
})

test('a room attendant sees their rooms', async ({ page }) => {
  await signIn(page, `blessing@${domain}`, PASSWORD)
  await expect(page.getByRole('heading', { name: 'Your rooms today' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Rooms assigned/ })).toBeVisible()
})

test('group finance leads with money across the group', async ({ page }) => {
  await signIn(page, `kunle@${domain}`, PASSWORD)
  await expect(page.getByRole('heading', { name: 'Across the group' })).toBeVisible()
  await expect(page.getByRole('link', { name: /City ledger outstanding/ })).toBeVisible()
})
