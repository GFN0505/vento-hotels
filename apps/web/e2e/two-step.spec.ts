// Two-step sign-in (design #24 · Two-step code; decision 0023): an owner turns it on from Home,
// then signs in with a code from their app. Desktop and phone.
import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { expectAccessible, PASSWORD, signIn, signUpOwnerWithGroup } from './support'

// What an authenticator app does with the key.
function totp(key: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of key.replace(/\s|=/g, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)?.map((b) => Number.parseInt(b, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const hmac = createHmac('sha1', bytes).update(counter).digest()
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

test('an owner turns on two-step sign-in, then signs in with a code', async ({
  page,
}, testInfo) => {
  const email = await signUpOwnerWithGroup(page, `two-step-${testInfo.project.name}`)

  await expect(page.getByText('Protect your account with two-step sign-in')).toBeVisible()
  await page.getByRole('button', { name: 'Turn on', exact: true }).click()
  const start = page.getByRole('dialog', { name: 'Turn on two-step sign-in' })
  await start.getByLabel('Your password', { exact: true }).fill(PASSWORD)
  await start.getByRole('button', { name: 'Continue' }).click()

  const scan = page.getByRole('dialog', { name: 'Scan with your authenticator app' })
  await expect(scan.getByRole('img', { name: /QR code/ })).toBeVisible()
  await expectAccessible(page)
  const key = (await scan.getByText(/^[A-Z2-7 ]{16,}$/).textContent()) ?? ''
  // Six digits check themselves.
  await scan.getByLabel('Code from the app').fill('123456')
  await expect(scan.getByText("That code didn't work.", { exact: false })).toBeVisible()
  await scan.getByLabel('Code from the app').fill(totp(key))

  const codes = page.getByRole('dialog', { name: 'Save your backup codes' })
  await expect(codes.getByRole('listitem')).toHaveCount(10)
  // Closing before saving them asks once.
  await codes.getByRole('button', { name: 'Done' }).click()
  await expect(codes.getByText('These are shown only once.', { exact: false })).toBeVisible()
  await codes.getByRole('button', { name: 'Download' }).click()
  await codes.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Two-step sign-in is on')).toBeVisible()
  await expect(page.getByText('Protect your account with two-step sign-in')).toHaveCount(0)

  // Signing in again now asks for a code after the password.
  await page.context().clearCookies()
  await signIn(page, email, PASSWORD)
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
  await expectAccessible(page)
  // Six digits check themselves; no button needed.
  await page.getByLabel('6-digit code').fill(totp(key))
  await expect(page.getByRole('heading', { name: 'Kora Hotels Group' })).toBeVisible()
})
