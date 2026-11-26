// Hotels and companies (spec: docs/specs/stage-1-hotels-and-companies.md): an owner completes the
// onboarding hotel and its company, uploads a logo to local storage, adds a hotel that the switch
// moves to, and meets someone else's save; on the demo group, a live hotel's company change is
// scheduled and cancelled, a hotel is archived and restored, companies are added, edited and
// refused archiving, and a GM changes only the times. Desktop and phone.
import { expect, type Page, test } from '@playwright/test'
import { choose, seedDemoGroup, signIn, signUpOwnerWithGroup, solidPng } from './support'

const selectedHotel = (page: Page) =>
  page.getByLabel('Hotel', { exact: true }).evaluate((select: HTMLSelectElement) => {
    return select.selectedOptions[0]?.text
  })

// A real 1 × 1 lossless WebP.
const tinyWebp = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')

async function upload(
  page: Page,
  button: 'Upload' | 'Replace',
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: button, exact: true }).click()
  await (await chooser).setFiles(file)
}

test('the owner completes the first hotel, uploads a logo and adds a hotel', async ({
  page,
}, testInfo) => {
  await signUpOwnerWithGroup(page, `hotels-${testInfo.project.name}`)
  await page.getByRole('link', { name: 'Complete', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kora Victoria Island', level: 1 })).toBeVisible()
  await expect(page.getByText("Add Kora Victoria Island's address.")).toBeVisible()
  await page.getByLabel('Street').fill('Plot 1412 Ahmadu Bello Way')
  await page.getByLabel('Area').fill('Victoria Island')
  await choose(page, 'State', 'Lagos')
  await choose(page, 'LGA', 'Eti-Osa')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Kora Victoria Island saved')).toBeVisible()
  await expect(page.getByText("Add Kora Victoria Island's address.")).toHaveCount(0)

  // Logo: any size goes to storage; remove, then undo; a WebP replaces it.
  const logo = page.getByRole('img', { name: 'Kora Victoria Island logo' })
  await expect(page.getByText('PNG, JPEG or WebP, up to 10 MB')).toBeVisible()
  await upload(page, 'Upload', {
    name: 'kora-logo.png',
    mimeType: 'image/png',
    buffer: solidPng(48),
  })
  await expect(page.getByText('Logo saved')).toBeVisible()
  await expect(logo).toHaveAttribute('src', /\.png/)
  await page.getByRole('button', { name: 'Remove Kora Victoria Island logo' }).click()
  await expect(logo).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(logo).toBeVisible()
  await upload(page, 'Replace', {
    name: 'kora-logo.webp',
    mimeType: 'image/webp',
    buffer: tinyWebp,
  })
  await expect(logo).toHaveAttribute('src', /\.webp/)

  // The company onboarding left bare.
  await expect(page.getByText('Kora Hospitality Ltd · RC number and TIN missing')).toBeVisible()
  await page.getByRole('button', { name: 'Edit company' }).click()
  const company = page.getByRole('dialog', { name: 'Kora Hospitality Ltd' })
  await company.getByLabel('RC number').fill('1184402')
  await expect(company.getByText('Saved as RC 1184402')).toBeVisible()
  await company.getByLabel('TIN').fill('21847390-0001')
  await company.getByText('Yes', { exact: true }).click()
  await company.getByRole('button', { name: 'Save company' }).click()
  await expect(page.getByText('Kora Hospitality Ltd saved')).toBeVisible()
  await expect(page.getByText('RC number and TIN missing')).toHaveCount(0)

  // A second hotel joins the switch, which moves to it, with its next steps.
  await page.getByRole('button', { name: 'Add a hotel' }).click()
  const add = page.getByRole('dialog', { name: 'Add a hotel' })
  await add.getByRole('button', { name: 'Add hotel' }).click()
  await expect(add.getByText('Enter the street')).toBeVisible()
  await add.getByLabel('Hotel name').fill('Kora Lekki')
  await expect(add.getByRole('combobox', { name: 'Owning company' })).toHaveValue(
    'Kora Hospitality Ltd',
  )
  await add.getByLabel('Street').fill('Plot 7 Admiralty Way')
  await add.getByLabel('Area').fill('Lekki Phase 1')
  await expect(add.getByRole('combobox', { name: 'LGA' })).toBeDisabled()
  await choose(add, 'State', 'Lagos')
  await choose(add, 'LGA', 'Eti-Osa')
  await expect(add.getByText('Time zone: Africa/Lagos (WAT)')).toBeVisible()
  await expect(add.getByLabel('Check-in from')).toHaveValue('14:00')
  await add.getByRole('button', { name: 'Add hotel' }).click()
  await expect(page.getByText('Kora Lekki added')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kora Lekki', level: 1 })).toBeVisible()
  expect(await selectedHotel(page)).toBe('Kora Lekki')
  await expect(page.getByRole('heading', { name: 'Next steps for Kora Lekki' })).toBeVisible()
  await page.getByRole('link', { name: 'Invite the team' }).click()
  const invite = page.getByRole('dialog', { name: 'Invite people' })
  await expect(invite.getByRole('checkbox', { name: 'Kora Lekki' })).toBeChecked()
  await expect(invite.getByRole('checkbox', { name: 'Kora Victoria Island' })).not.toBeChecked()
})

test("a save made after someone else's asks to reload, and offline is read-only", async ({
  page,
  context,
}, testInfo) => {
  await signUpOwnerWithGroup(page, `hotels-stale-${testInfo.project.name}`)
  await page.goto('/settings/hotels')
  // Editing here first, so this page keeps the version it started from.
  await page.getByLabel('Check-in from').fill('15:00')
  const other = await context.newPage()
  await other.goto('/settings/hotels')
  await other.getByLabel('Check-out by').fill('11:00')
  await other.getByRole('button', { name: 'Save changes' }).click()
  await expect(other.getByText('Kora Victoria Island saved')).toBeVisible()
  await other.close()

  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(
    page.getByText(
      /^You changed Kora Victoria Island in another window at \d\d:\d\d\. Reload to see the change, then save again\.$/,
    ),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await page.getByRole('button', { name: 'Reload' }).click()
  await expect(page.getByLabel('Check-out by')).toHaveValue('11:00')
  await expect(page.getByLabel('Check-in from')).toHaveValue('14:00')

  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByText(/^Offline since \d\d:\d\d\./)).toBeVisible()
  await expect(page.getByText('Needs a connection').first()).toBeVisible()
  await expect(page.getByLabel('Check-in from')).not.toBeEditable()
  await expect(page.getByRole('button', { name: 'Add a hotel' })).toBeDisabled()
  await context.setOffline(false)
})

test.describe('on the demo group', () => {
  const PASSWORD = 'Demo-pass-42!'
  let domain = ''
  // biome-ignore lint/correctness/noEmptyPattern: Playwright needs the fixtures argument destructured.
  test.beforeAll(({}, testInfo) => {
    domain = seedDemoGroup(`hotels-${testInfo.project.name}`, PASSWORD)
  })

  async function asOwner(page: Page) {
    await signIn(page, `adaeze@${domain}`, PASSWORD)
    await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()
  }

  test('a live hotel schedules a change of company, then cancels it', async ({ page }) => {
    await asOwner(page)
    await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'Kora Abuja' })
    await page.goto('/settings/hotels')
    await expect(page.getByRole('heading', { name: 'Kora Abuja', level: 1 })).toBeVisible()
    await choose(page, 'Owning company', 'Kora Hospitality Ltd')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Say why, in a few words')).toBeVisible()
    await page.getByLabel('Reason for changing the owning company').fill('Transfer to new company')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Kora Abuja saved')).toBeVisible()
    await expect(page.getByText(/^Kora Hospitality Ltd from \d+ \w+ \d{4}$/)).toBeVisible()
    await page.getByRole('button', { name: 'Cancel change' }).click()
    const keep = page.getByRole('dialog', { name: 'Keep Kora Abuja with Kora Hotels Abuja Ltd?' })
    await keep.getByLabel('Reason for cancelling the change').fill('Transfer called off')
    await keep.getByRole('button', { name: 'Cancel change' }).click()
    await expect(page.getByText('Kora Abuja stays with Kora Hotels Abuja Ltd')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel change' })).toHaveCount(0)
  })

  test('archiving a hotel shows what it affects; it leaves the switch and can be restored', async ({
    page,
  }) => {
    await asOwner(page)
    await page.goto('/settings/hotels')
    await expect(page.getByText('Kora Hotels Group · 4 hotels')).toBeVisible()
    await page.getByRole('button', { name: /Kora Port Harcourt/ }).click()
    await expect(page.getByRole('heading', { name: 'Kora Port Harcourt', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Archive hotel' }).click()
    const ask = page.getByRole('dialog', { name: 'Archive Kora Port Harcourt?' })
    await expect(ask.getByText(/Its 72 rooms, history and reports are kept\./)).toBeVisible()
    await ask.getByRole('button', { name: 'Archive Kora Port Harcourt' }).click()
    await expect(ask.getByText('Say why, in a few words')).toBeVisible()
    await ask.getByLabel('Reason for archiving').fill('Lease ended 30 Nov 2026')
    await ask.getByRole('button', { name: 'Archive Kora Port Harcourt' }).click()
    await expect(page.getByText('Kora Port Harcourt archived')).toBeVisible()
    await expect(page.getByText('Kora Hotels Group · 3 hotels')).toBeVisible()
    expect(await selectedHotel(page)).toBe('All hotels')
    await expect(page.getByRole('option', { name: 'Kora Port Harcourt' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Archived', exact: true }).click()
    await page.getByRole('button', { name: 'Restore Kora Port Harcourt' }).click()
    const restore = page.getByRole('dialog', { name: 'Restore Kora Port Harcourt?' })
    await restore.getByLabel('Reason for restoring').fill('Lease renewed')
    await restore.getByRole('button', { name: 'Restore Kora Port Harcourt' }).click()
    await expect(page.getByText('Kora Port Harcourt restored')).toBeVisible()
    await expect(page.getByText('No archived hotels.')).toBeVisible()
    await expect(page.getByRole('option', { name: 'Kora Port Harcourt' })).toHaveCount(1)
  })

  test('companies are added and edited, and a company with hotels is not archived', async ({
    page,
  }) => {
    await asOwner(page)
    await page.goto('/settings/companies')
    await expect(page.getByText('Kora Hotels Group · 3 companies')).toBeVisible()
    await page.getByRole('button', { name: 'Add a company' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add a company' })
    await sheet.getByLabel('Legal name').fill('Kora Lekki Ltd')
    await sheet.getByLabel('RC number').fill('1400001')
    await expect(sheet.getByText('Saved as RC 1400001')).toBeVisible()
    await sheet.getByLabel('TIN').fill('23308817-0001')
    await sheet.getByRole('button', { name: 'Save company' }).click()
    await expect(sheet.getByText('23308817-0001 belongs to Kora PH Ltd.')).toBeVisible()
    await sheet.getByLabel('TIN').fill('24400001-0001')
    await sheet.getByRole('button', { name: 'Save company' }).click()
    await expect(page.getByText('Kora Lekki Ltd added')).toBeVisible()

    await page.getByRole('button', { name: 'Kora Lekki Ltd' }).click()
    const edit = page.getByRole('dialog', { name: 'Kora Lekki Ltd' })
    await edit.getByText('Yes', { exact: true }).click()
    await edit.getByRole('button', { name: 'Save company' }).click()
    await expect(page.getByText('Kora Lekki Ltd saved')).toBeVisible()

    await page.getByRole('button', { name: 'Kora PH Ltd' }).click()
    const ph = page.getByRole('dialog', { name: 'Kora PH Ltd' })
    await expect(ph.getByRole('button', { name: 'Archive company' })).toBeDisabled()
    await expect(
      ph.getByText(
        'Kora PH Ltd owns 1 hotel (Kora Port Harcourt). Move it to another company first.',
      ),
    ).toBeVisible()
    await ph.getByRole('button', { name: 'Cancel', exact: true }).click()

    await page.getByRole('button', { name: 'Kora Lekki Ltd' }).click()
    await page.getByRole('button', { name: 'Archive company' }).click()
    const ask = page.getByRole('dialog', { name: 'Archive Kora Lekki Ltd?' })
    await ask.getByLabel('Reason for archiving').fill('Set up by mistake')
    await ask.getByRole('button', { name: 'Archive Kora Lekki Ltd' }).click()
    await expect(page.getByText('Kora Lekki Ltd archived')).toBeVisible()
    await page.getByRole('button', { name: 'Archived', exact: true }).click()
    await page.getByRole('button', { name: 'Restore Kora Lekki Ltd' }).click()
    const back = page.getByRole('dialog', { name: 'Restore Kora Lekki Ltd?' })
    await back.getByLabel('Reason for restoring').fill('Needed after all')
    await back.getByRole('button', { name: 'Restore Kora Lekki Ltd' }).click()
    await expect(page.getByText('Kora Lekki Ltd restored')).toBeVisible()

    // One hotel chosen in the top bar: only the company that owns it.
    await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'Kora Victoria Island' })
    await expect(
      page.getByText('Owned by Kora Hospitality Ltd. All hotels shows every company.'),
    ).toBeVisible()
  })

  test('a GM changes only the check-in and check-out times', async ({ page }) => {
    await signIn(page, `tunde@${domain}`, PASSWORD)
    await expect(page.getByRole('heading', { name: /^Good/ })).toBeVisible()
    await page.goto('/settings')
    await expect(
      page.getByRole('heading', { name: 'Kora Victoria Island', level: 1 }),
    ).toBeVisible()
    await expect(
      page.getByText('You can change check-in and check-out times. Ask the owner or a group admin'),
    ).toBeVisible()
    await expect(page.getByLabel('Hotel name')).not.toBeEditable()
    await expect(page.getByLabel('Street')).not.toBeEditable()
    await expect(page.getByLabel('Owning company')).not.toBeEditable()
    await expect(page.getByLabel('Check-out by')).toBeEditable()
    await expect(page.getByRole('button', { name: 'Archive hotel' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add a hotel' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toHaveCount(0)
    await expect(
      page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Companies' }),
    ).toHaveCount(0)
    await page.getByLabel('Check-out by').fill('11:00')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Kora Victoria Island saved')).toBeVisible()
    await page.goto('/settings/companies')
    await expect(page.getByText("You don't have access to companies")).toBeVisible()
  })
})
