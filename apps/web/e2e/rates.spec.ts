// Rate plans and the rate calendar (spec: docs/specs/stage-1-rate-plans.md): the first rate with
// breakfast, a derived plan and the prices that follow, a cell and a range with a season and min
// stay, Undo, read-only offline; on the demo group, the owner picks a hotel and gives a reason for
// lowering tonight's price, and the front desk reads rates without changing them. Desktop and phone.
import { expect, type Page, test } from '@playwright/test'
import { buildRooms, seedDemoGroup, signIn, signUpOwnerWithGroup } from './support'

// The hotel's business date: a new hotel starts on today's date in Lagos.
const lagosToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const visible = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name }).filter({ visible: true }).first()

async function firstRate(page: Page) {
  await page.goto('/rates/plans')
  await expect(page.getByRole('heading', { name: 'Your first rate' })).toBeVisible()
  await page.getByLabel('Standard Queen, weekday price').fill('120000')
  await page.getByLabel('Deluxe King, weekday price').fill('150,000')
  await expect(page.getByLabel('Also create a Bed & breakfast plan at +₦18,000')).toBeChecked()
  await page.getByRole('button', { name: 'Create Best available' }).click()
  await expect(page.getByText('Best available and Bed & breakfast created')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Bed & breakfast', exact: true })).toBeVisible()
}

test('first rate with breakfast, then a derived plan whose prices follow', async ({
  page,
}, testInfo) => {
  await signUpOwnerWithGroup(page, `rates-first-${testInfo.project.name}`)
  await page.goto('/rates/rooms')
  await buildRooms(page)
  await firstRate(page)
  await expect(page.getByText('Followed by Bed & breakfast')).toBeVisible()

  await page.getByRole('link', { name: 'New rate plan' }).click()
  await page.getByLabel('Plan name').fill('Non-refundable')
  await expect(page.getByLabel('Code', { exact: true })).toHaveValue('NR')
  await page.getByLabel('Code', { exact: true }).fill('NRF')
  await page.getByLabel('Derived from a parent plan').check()
  await page.getByLabel('Parent plan', { exact: true }).selectOption({ label: 'Best available' })
  await page.getByLabel('Or percentage').fill('-10')
  // The preview follows the parent with the shared maths: ₦120,000 − 10%.
  await expect(page.getByRole('cell', { name: '₦108,000' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '₦135,000' })).toBeVisible()
  await page.getByLabel('Cancellation policy').selectOption({ label: 'Non-refundable' })
  await page.getByLabel('Deposit rule').selectOption({ label: 'Full stay' })
  await page.getByLabel('Due', { exact: true }).selectOption({ label: 'At booking' })
  await visible(page, 'Save plan').click()
  await expect(page.getByText('Non-refundable saved')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rate plan · Non-refundable' })).toBeVisible()

  await page.getByRole('link', { name: 'Rate calendar' }).click()
  await expect(visible(page, /^Standard Queen, Non-refundable, .*₦108,000/)).toBeVisible()
})

test('a price for one night, a season over a range with min stay, and Undo', async ({
  page,
  context,
}, testInfo) => {
  await signUpOwnerWithGroup(page, `rates-dates-${testInfo.project.name}`)
  await page.goto('/rates/rooms')
  await buildRooms(page)
  await firstRate(page)
  const from = plusDays(lagosToday(), 10)
  await page.goto(`/rates/calendar?from=${from}`)

  // One night, inline: click the price, type, Enter.
  await visible(page, /^Standard Queen, Best available, .*₦120,000/).click()
  await page.getByRole('textbox', { name: /^New price, Standard Queen/ }).fill('135000')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Standard Queen on \d+ \w+ set to ₦135,000/)).toBeVisible()
  await expect(page.getByText('Bed & breakfast follows automatically.')).toBeVisible()
  await expect(visible(page, /^Standard Queen, Bed & breakfast, .*₦153,000/)).toBeVisible()

  // A range: four nights, new prices, a season and min stay 2.
  await page.getByRole('button', { name: 'Change dates' }).click()
  const sheet = page.getByRole('dialog', { name: 'Change dates · Best available' })
  await sheet.getByLabel('From', { exact: true }).fill(from)
  await sheet.getByLabel('To', { exact: true }).fill(plusDays(from, 3))
  await expect(sheet.getByRole('button', { name: 'Apply to 4 dates' })).toBeDisabled()
  await expect(sheet.getByText('Choose a price or a restriction to change')).toBeVisible()
  await sheet.getByLabel('New prices').check()
  await sheet.getByRole('textbox', { name: 'Standard Queen' }).fill('140000')
  await sheet.getByRole('textbox', { name: 'Deluxe King' }).fill('175000')
  await sheet.getByLabel('Season name (optional)').fill('Festive season')
  await sheet.getByRole('group', { name: 'Min stay' }).getByLabel('On').check()
  await expect(sheet.getByText('4 dates change for 2 room types.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Apply to 4 dates' }).click()
  await expect(page.getByText('Prices changed for 4 dates')).toBeVisible()
  await expect(
    visible(page, /^Standard Queen, Best available, .*₦140,000, min stay 2 nights, Festive season/),
  ).toBeVisible()

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Prices changed for 4 dates' })
    .getByRole('button', { name: 'Undo' })
    .click()
  await expect(page.getByText('Change undone')).toBeVisible()
  await expect(visible(page, /^Standard Queen, Best available, .*₦135,000/)).toBeVisible()

  // Offline, rates are read-only and nothing is queued.
  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByText('Rate plans and rates are read-only offline.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change dates' })).toBeDisabled()
  await page.getByRole('link', { name: 'Rate plans' }).click()
  await expect(page.getByText('Needs a connection').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Best available', exact: true })).toBeVisible()
  await context.setOffline(false)
})

test.describe('on the demo group', () => {
  const PASSWORD = 'Demo-pass-42!'
  let domain = ''
  // biome-ignore lint/correctness/noEmptyPattern: Playwright needs the fixtures argument destructured.
  test.beforeAll(({}, testInfo) => {
    domain = seedDemoGroup(`rates-${testInfo.project.name}`, PASSWORD)
  })

  test('the owner picks a hotel, and lowering tonight’s price asks why', async ({ page }) => {
    await signIn(page, `adaeze@${domain}`, PASSWORD)
    await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()
    await page.goto('/rates/calendar')
    await expect(page.getByText('Rates are set per hotel. Pick a hotel.')).toBeVisible()
    await page.getByRole('button', { name: /Kora Victoria Island/ }).click()
    // The first night is tonight (the business date).
    await visible(page, /^Standard Queen, Best available, .*₦120,000/).click()
    await page.getByRole('textbox', { name: /^New price, Standard Queen/ }).fill('110000')
    await page.keyboard.press('Enter')
    const ask = page.getByRole('dialog', { name: "Lower tonight's price?" })
    await expect(ask.getByText('₦120,000 →')).toBeVisible()
    await ask.getByRole('button', { name: 'Change price' }).click()
    await expect(ask.getByText('Say why, in a few words')).toBeVisible()
    await ask.getByLabel("Reason for lowering tonight's price").fill('Slow night, match Eko Hotel')
    await ask.getByRole('button', { name: 'Change price' }).click()
    await expect(page.getByText(/Standard Queen on \d+ \w+ set to ₦110,000/)).toBeVisible()
  })

  test('the front desk reads rates and can’t change them', async ({ page }) => {
    await signIn(page, `chiamaka@${domain}`, PASSWORD)
    await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()
    await page.goto('/rates')
    await expect(page).toHaveURL(/\/rates\/plans/)
    await expect(page.getByRole('heading', { name: 'Rate plans', level: 1 })).toBeVisible()
    await expect(page.getByText('You can read rates.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'New rate plan' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Rate calendar' }).click()
    await visible(page, /^Standard Queen, Bed & breakfast, /).click()
    // Bed & breakfast follows Best available (+₦18,000), read as a caller hears it.
    await expect(
      page.getByText(/^Standard Queen · Bed & breakfast · \w+ \d+ \w+ · ₦[\d,]+/),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change dates' })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: /^New price/ })).toHaveCount(0)
  })
})
