// An owner's first visit (design 19 and 24): sign up, confirm the email, set up the group, land on
// home, sign out and back in. Runs on desktop and phone widths.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { OUTBOX } from '../playwright.config'

const PASSWORD = 'correct-horse-battery-staple'

async function confirmationLink(email: string): Promise<string> {
  // The API saves emails as files in the outbox; poll briefly for this person's message.
  for (let attempt = 0; attempt < 50; attempt++) {
    const files = (() => {
      try {
        return readdirSync(OUTBOX)
          .filter((f) => f.endsWith('.json'))
          .sort()
      } catch {
        return []
      }
    })()
    for (const file of files.reverse()) {
      const message = JSON.parse(readFileSync(join(OUTBOX, file), 'utf8')) as {
        to: string
        text: string
      }
      const link = message.to === email ? message.text.match(/https?:\/\/\S+/)?.[0] : undefined
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`No confirmation email for ${email}`)
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('sends visitors without a session to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Vento' })).toBeVisible()
})

test('shows a plain message for a wrong password', async ({ page }) => {
  await signIn(page, 'nobody@example.test', 'wrong-password-123')
  await expect(page.getByRole('alert')).toHaveText("That email and password don't match.")
})

test('an owner sets up their hotel group and lands on home', async ({ page }, testInfo) => {
  const email = `adaeze.${testInfo.project.name}.${Date.now()}@example.test`

  await page.goto('/get-started')
  await page.getByLabel('Full name').fill('Adaeze Okafor')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Create a password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

  // Signing in before confirming is refused with a helpful message.
  await signIn(page, email, PASSWORD)
  await expect(page.getByRole('alert')).toContainText('Confirm your email first')

  // The link in the email confirms, signs in and continues to setup.
  await page.goto(await confirmationLink(email))
  await expect(page.getByRole('heading', { name: 'Your hotel group' })).toBeVisible()
  await page.getByLabel('Group name').fill('Kora Hotels Group')
  await page.getByLabel('Company (as registered with CAC)').fill('Kora Hospitality Ltd')
  await page.getByLabel('First hotel').fill('Kora Victoria Island')
  await page.getByLabel('State').fill('Lagos')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Kora Hotels Group' })).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Kora Victoria Island' }),
  ).toContainText('Business date')

  // Sign out and back in: straight to home, the group already set up.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await signIn(page, email, PASSWORD)
  await expect(page.getByRole('heading', { name: 'Kora Hotels Group' })).toBeVisible()
})
