// The front desk (spec: docs/specs/stage-1-front-desk-check-in.md) on the demo group: the lists and
// the Tonight strip, a returning guest checked in in two clicks with Undo, a first-time foreign
// national with the foreign national section, an arrival without a room with an ID photo uploaded
// from a fixture image, the walk-in, a GM revealing a passport number, and the phone cards.
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { seedDemoGroup, signIn } from './support'

const PASSWORD = 'Demo-pass-42!'
const ID_CARD = fileURLToPath(new URL('./fixtures/id-card.png', import.meta.url))

async function signedIn(page: Page, who: string, domain: string) {
  // The card's print dialog stays out of the browser tests (it's tested on the API).
  await page.addInitScript(() => localStorage.setItem('vento.printCard', 'off'))
  await signIn(page, `${who}@${domain}`, PASSWORD)
  await page.getByRole('heading', { name: /^Good/ }).waitFor()
}

async function frontDesk(page: Page) {
  await page.goto('/front-desk')
  await expect(page.getByRole('heading', { name: 'Front desk', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tonight' })).toContainText(/\d+ occupied/)
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'The table is for wider screens; phones get cards.')

  test('checks in a returning guest in two clicks, with Undo, and a foreign national with the foreign section', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`desk-in-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'chiamaka', domain)
    await frontDesk(page)
    await expect(page.getByRole('tab', { name: /^Arrivals/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('heading', { name: /^Arrivals · \d+ to come/ })).toBeVisible()

    // Mrs Okafor: her October NIN and ID photo are reused, so the sheet opens at the Room step.
    await page.getByRole('button', { name: 'Check in Ngozi Okafor' }).click()
    const sheet = page.getByRole('dialog', { name: 'Check in · Ngozi Okafor' })
    await expect(sheet.getByRole('button', { name: /^Check in to 404/ })).toBeVisible()
    await sheet.getByRole('button', { name: 'Registration', exact: true }).click()
    await expect(sheet.getByText(/Same as last stay · ••••••6612/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Room', exact: true }).click()
    await sheet.getByRole('button', { name: /^Check in to 404/ }).click()
    await expect(page.getByText('Ngozi Okafor checked in to 404')).toBeVisible()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('Check-in undone')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check in Ngozi Okafor' })).toBeVisible()

    // Mr Mensah, Ghanaian, first time: the foreign national section with ECOWAS "Not required".
    await page.getByRole('button', { name: 'Check in Daniel Mensah' }).click()
    const mensah = page.getByRole('dialog', { name: 'Check in · Daniel Mensah' })
    await mensah.getByTestId('id-upload').setInputFiles(ID_CARD)
    await expect(mensah.getByRole('img', { name: 'The ID, as it will be saved' })).toBeVisible()
    await mensah.getByRole('button', { name: 'Continue to registration' }).click()
    await expect(
      mensah.getByRole('heading', { name: 'Foreign national registration' }),
    ).toBeVisible()
    await expect(mensah.getByLabel('Visa or permit')).toHaveValue('not_required')
    await mensah.getByLabel('Passport number').fill('G1234512')
    await mensah.getByLabel('Passport expiry').fill('2030-05-01')
    await mensah.getByLabel('Occupation').fill('Engineer')
    await mensah.getByLabel('Home address').fill('7 Oxford Street, Osu')
    await mensah.getByLabel('Town or city').fill('Accra')
    await mensah.getByLabel('Arriving from').fill('Accra')
    await mensah.getByLabel('Next destination').fill('Accra')
    await mensah.getByRole('button', { name: 'Continue to room' }).click()
    await mensah.getByRole('button', { name: /^Check in to 502/ }).click()
    await expect(page.getByText('Daniel Mensah checked in to 502')).toBeVisible()

    // In house: he is there, with his card number on the reservation.
    await page.getByRole('tab', { name: /^In house/ }).click()
    await page.getByPlaceholder('Find guest, room, booking').fill('Mensah')
    await expect(page.getByRole('link', { name: 'Daniel Mensah', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Daniel Mensah', exact: true }).click()
    await expect(page.getByRole('heading', { name: /^Registration/ })).toBeVisible()
    await expect(page.getByText('G1••••12')).toBeVisible()
  })

  test('checks in an arrival without a room, ready rooms first, with an ID photo from a scan', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`desk-room-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'chiamaka', domain)
    await frontDesk(page)
    await page.getByRole('button', { name: /^Not in a room/ }).click()
    await page.getByRole('button', { name: 'Check in Funmilayo Adebayo' }).click()
    const sheet = page.getByRole('dialog', { name: 'Check in · Funmilayo Adebayo' })
    await sheet.getByTestId('id-upload').setInputFiles(ID_CARD)
    await sheet.getByRole('button', { name: 'Continue to registration' }).click()
    // Nothing typed yet: the first problem says what to do.
    await sheet.getByRole('button', { name: 'Continue to room' }).click()
    await expect(sheet.getByRole('alert').first()).toBeVisible()
    await sheet.getByLabel('ID type').selectOption('nin')
    await sheet.getByLabel('NIN number').fill('12345678901')
    await sheet.getByLabel('Home address').fill('3 Awolowo Road')
    await sheet.getByLabel('Town or city').fill('Ikoyi')
    await sheet.getByRole('button', { name: 'Continue to room' }).click()
    await expect(sheet.getByText(/^Ready rooms first/)).toBeVisible()
    const first = sheet.getByRole('radio').first()
    await first.check()
    await sheet.getByRole('button', { name: /^Check in to / }).click()
    await expect(page.getByText(/^Funmilayo Adebayo checked in to \d+/)).toBeVisible()
  })

  test('books and checks in a walk-in, the Okoro family in 302', async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`desk-walk-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'chiamaka', domain)
    await frontDesk(page)
    await page.keyboard.press('w')
    await expect(page.getByRole('heading', { name: 'Walk-in', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Change dates' }).click()
    await page
      .getByLabel('Departure')
      .fill(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10))
    await page.getByLabel('Adults').selectOption('2')
    await page.getByLabel('Children').selectOption('2')
    await page.getByRole('button', { name: /^Standard Queen/ }).click()
    await expect(page.getByRole('button', { name: /^Check in to 302/ })).toBeVisible()
    await page.getByLabel('Phone · finds returning guests').fill('0803 412 7790')
    await page.getByLabel('First name').fill('Emeka')
    await page.getByLabel('Last name').fill('Okoro')
    await page.getByLabel('ID type').selectOption('nin')
    await page.getByLabel('NIN number').fill('23456789012')
    await page.getByLabel('Home address').fill('12 Allen Avenue')
    await page.getByLabel('Town or city').fill('Ikeja')
    await page.getByTestId('id-upload').setInputFiles(ID_CARD)
    await page.getByRole('button', { name: /^Check in to 302/ }).click()
    await expect(page.getByText('Emeka Okoro checked in to 302')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Front desk', level: 1 })).toBeVisible()
  })

  test('a GM reveals a passport number with a reason; the front desk has no Reveal', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`desk-reveal-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'tunde', domain)
    await frontDesk(page)
    await page.getByRole('tab', { name: /^In house/ }).click()
    await page.getByPlaceholder('Find guest, room, booking').fill('Dubois')
    await page.getByRole('link', { name: 'Claire Dubois', exact: true }).click()
    await page.getByRole('heading', { name: /^Registration/ }).waitFor()
    await page.getByRole('button', { name: 'Reveal' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Reveal passport number?' })
    await dialog.getByLabel('Reason').fill('Immigration officer at the desk')
    await dialog.getByRole('button', { name: 'Reveal' }).click()
    await expect(dialog.getByText('19FR48213')).toBeVisible()
    await expect(dialog.getByText(/Hidden again in \d+ s/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Hide' }).click()
    await expect(page.getByRole('button', { name: 'View ID photo' })).toBeVisible()
  })

  test('checks in an assigned arrival offline, which syncs when the connection is back; walk-ins wait', async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`desk-offline-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'chiamaka', domain)
    await frontDesk(page)
    await context.setOffline(true)
    await expect(page.getByText(/Check-ins save on this computer and sync later/)).toBeVisible()
    await expect(
      page.getByText('Walk-ins need a connection to check live availability.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Check in Ngozi Okafor' }).click()
    const sheet = page.getByRole('dialog', { name: 'Check in · Ngozi Okafor' })
    await sheet.getByTestId('id-upload').setInputFiles(ID_CARD)
    await sheet.getByRole('button', { name: 'Continue to registration' }).click()
    await sheet.getByLabel('ID type').selectOption('nin')
    await sheet.getByLabel('NIN number').fill('12345676612')
    await sheet.getByLabel('Home address').fill('9 Isaac John Street')
    await sheet.getByLabel('Town or city').fill('Ikeja GRA')
    await sheet.getByRole('button', { name: 'Continue to room' }).click()
    await expect(sheet.getByText('Picking a room needs a connection.')).toBeVisible()
    await sheet.getByRole('button', { name: /^Check in to 404/ }).click()
    await expect(page.getByText('Ngozi Okafor checked in · Will sync')).toBeVisible()
    await context.setOffline(false)
    await page.getByRole('tab', { name: /^In house/ }).click()
    await page.getByPlaceholder('Find guest, room, booking').fill('Okafor')
    await expect(page.getByRole('link', { name: 'Ngozi Okafor', exact: true })).toBeVisible({
      timeout: 40_000,
    })
  })

  test('All hotels asks for a hotel, with each hotel’s figures', async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`desk-all-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'adaeze', domain)
    await page.goto('/front-desk')
    await page.getByLabel('Hotel', { exact: true }).selectOption({ label: 'All hotels' })
    await expect(
      page.getByRole('heading', { name: 'The front desk is per hotel. Pick a hotel.' }),
    ).toBeVisible()
    await expect(page.getByText(/\d+ arrivals · \d+ in house/).first()).toBeVisible()
    await expect(page.getByText('No arrivals today').first()).toBeVisible()
  })
})

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'Cards are for phones.')

  test('shows the arrivals as cards and checks in from one', async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const domain = seedDemoGroup(`desk-phone-${testInfo.project.name}`, PASSWORD)
    await signedIn(page, 'chiamaka', domain)
    await frontDesk(page)
    await page.getByRole('button', { name: 'Check in Ngozi Okafor' }).click()
    const sheet = page.getByRole('dialog', { name: 'Check in · Ngozi Okafor' })
    await sheet.getByRole('button', { name: /^Check in to 404/ }).click()
    await expect(page.getByText('Ngozi Okafor checked in to 404')).toBeVisible()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 412)
  })
})
