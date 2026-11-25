// An owner's first visit (design 19 and 24): sign up, confirm the email, set up the group, land on
// home, sign out and back in. Runs on desktop and phone widths.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { OUTBOX } from '../playwright.config'

const PASSWORD = 'correct-horse-battery-staple'

async function linkFromEmail(email: string, subject: RegExp): Promise<string> {
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
        subject: string
        text: string
      }
      const match = message.to === email && subject.test(message.subject)
      const link = match ? message.text.match(/https?:\/\/\S+/)?.[0] : undefined
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`No email matching ${subject} for ${email}`)
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
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
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
})

test('an owner sets up their hotel group and lands on home', async ({ page }, testInfo) => {
  const email = `adaeze.${testInfo.project.name}.${Date.now()}@example.test`

  await page.goto('/get-started')
  await page.getByLabel('Full name').fill('Adaeze Okafor')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Create a password').fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

  // Signing in before confirming is refused with a helpful message.
  await signIn(page, email, PASSWORD)
  await expect(page.getByRole('alert')).toContainText('Confirm your email first')

  // The link in the email confirms, signs in and continues to setup.
  await page.goto(await linkFromEmail(email, /Confirm your email/))
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

test('sign-up checks the details before sending them', async ({ page }) => {
  await page.goto('/get-started')
  await page.getByLabel('Full name').fill('Chiamaka Eze')
  await page.getByLabel('Work email').fill('not-an-email')
  await page.getByLabel('Create a password').fill('short')
  await page.getByLabel('Confirm password').fill('different')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Enter a valid email')).toBeVisible()
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible()
  await expect(page.getByText("Passwords don't match.")).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Set up your hotel group' })).toBeVisible()
})

test('password fields can be shown and hidden', async ({ page }) => {
  await page.goto('/sign-in')
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('secret-value')
  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
})

test('a forgotten password can be reset from the emailed link', async ({ page }, testInfo) => {
  const email = `reset.${testInfo.project.name}.${Date.now()}@example.test`
  await page.goto('/get-started')
  await page.getByLabel('Full name').fill('Tunde Bello')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Create a password').fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.goto(await linkFromEmail(email, /Confirm your email/))

  await page.goto('/sign-in')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Work email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

  const NEW_PASSWORD = 'a-brand-new-password-42'
  await page.goto(await linkFromEmail(email, /Reset your Vento password/))
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await page.getByLabel('New password').fill(NEW_PASSWORD)
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible()

  // The old password no longer works; the new one does.
  await signIn(page, email, PASSWORD)
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await signIn(page, email, NEW_PASSWORD)
  await expect(page.getByRole('heading', { name: 'Your hotel group' })).toBeVisible()
})

test('an expired or used reset link says so', async ({ page }) => {
  await page.goto('/reset-password?error=INVALID_TOKEN')
  await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible()
})

test.describe('sign-in brand panel motion', () => {
  test.skip(({ isMobile }) => isMobile, 'The brand panel only shows on desktop')

  test('drifts gently and finishes its entrance with all copy visible', async ({ page }) => {
    await page.goto('/sign-in')
    const headline = page.getByRole('heading', { name: /accounted for/ })
    await expect(headline).toBeVisible()
    await expect(page.getByText('For hotel groups in Nigeria')).toHaveCSS('opacity', '1')
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => (a as CSSAnimation).animationName),
    )
    expect(running).toEqual(
      expect.arrayContaining(['auth-drift-a', 'auth-drift-b', 'auth-drift-c']),
    )
  })

  test('stays still, with everything visible, for people who ask for reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/sign-in')
    await expect(page.getByText('For hotel groups in Nigeria')).toHaveCSS('opacity', '1')
    await expect(page.getByRole('heading', { name: /accounted for/ })).toBeVisible()
    const animations = await page.evaluate(() => document.getAnimations().length)
    expect(animations).toBe(0)
  })
})
