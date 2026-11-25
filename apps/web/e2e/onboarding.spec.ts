// An owner's first visit (design 19 and 24): sign up, confirm the email, set up the group, land on
// home, sign out and back in. Runs on desktop and phone widths.
import { expect, test } from '@playwright/test'
import { linkFromEmail, PASSWORD, signIn } from './support'

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
  await expect(page.getByText("Your password doesn't meet every rule below yet.")).toBeVisible()
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

  const NEW_PASSWORD = 'Brand-new-pass-42!'
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

test('the password checklist appears on typing and ticks each rule as it is met', async ({
  page,
}) => {
  await page.goto('/get-started')
  const rules = page.locator('#password-rules li')
  const password = page.getByLabel('Create a password', { exact: true })

  // Hidden until they start typing.
  await expect(rules).toHaveCount(0)
  await password.fill('kora')
  await expect(rules).toHaveCount(5)
  await expect(rules.filter({ hasText: 'A small letter' })).toContainText('(done)')
  await expect(rules.filter({ hasText: 'A capital letter' })).toContainText('(still needed)')
  await expect(rules.filter({ hasText: 'At least 8 characters' })).toContainText('(still needed)')

  await password.fill('Kora-Hotel1')
  for (const rule of await rules.all()) await expect(rule).toContainText('(done)')
})

test.describe('field behaviour', () => {
  test('suggests a fix for a mistyped email provider', async ({ page }) => {
    await page.goto('/get-started')
    const email = page.getByLabel('Work email')
    await email.fill('ada@gmial.com')
    await page.getByLabel('Create a password', { exact: true }).focus()
    await page.getByRole('button', { name: 'ada@gmail.com' }).click()
    await expect(email).toHaveValue('ada@gmail.com')
  })

  test('checks a field on leaving it, and clears the message once fixed', async ({ page }) => {
    await page.goto('/get-started')
    const email = page.getByLabel('Work email')
    await email.fill('ada@')
    await page.getByLabel('Create a password', { exact: true }).focus()
    await expect(page.getByText('Enter a valid email')).toBeVisible()
    await email.fill('ada@korahotels.ng')
    await expect(page.getByText('Enter a valid email')).toHaveCount(0)
  })

  test('shows when the passwords match', async ({ page }) => {
    await page.goto('/get-started')
    await page.getByLabel('Create a password', { exact: true }).fill(PASSWORD)
    const confirm = page.getByLabel('Confirm password', { exact: true })
    await confirm.fill('Correct-horse')
    await page.getByLabel('Full name').focus()
    await expect(page.getByText("Passwords don't match.")).toBeVisible()
    await confirm.fill(PASSWORD)
    await expect(page.getByText('Passwords match')).toBeVisible()
  })

  test('moves focus to the first field with a problem', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByLabel('Work email')).toBeFocused()
    await page.getByLabel('Work email').fill('ada@korahotels.ng')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
  })

  test('uses 16px text on phones so iPhones do not zoom into fields', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Phone-only rule')
    await page.goto('/sign-in')
    await expect(page.getByLabel('Work email')).toHaveCSS('font-size', '16px')
  })
})
