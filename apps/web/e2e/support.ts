// Shared helpers for browser tests: reading emails from the local outbox, signing in, setting up a
// hotel group, and the accessibility check every page must pass (docs/UX-STANDARD.md, section 5).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { OUTBOX } from '../playwright.config'

export const PASSWORD = 'Correct-horse-42!'

export async function linkFromEmail(email: string, subject: RegExp): Promise<string> {
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

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// Creates an owner; ends on "Check your inbox", before the email is confirmed.
export async function signUpOwner(page: Page, tag: string): Promise<string> {
  const email = `owner.${tag}.${Date.now()}@example.test`
  await page.goto('/get-started')
  await page.getByLabel('Full name').fill('Adaeze Okafor')
  await page.getByLabel('Work email').fill(email)
  await page.getByLabel('Create a password').fill(PASSWORD)
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()
  return email
}

// Creates an owner, confirms their email and sets up Kora Hotels Group; ends signed in on home.
export async function signUpOwnerWithGroup(page: Page, tag: string): Promise<string> {
  const email = await signUpOwner(page, tag)
  await page.goto(await linkFromEmail(email, /Confirm your email/))
  await page.getByLabel('Group name').fill('Kora Hotels Group')
  await page.getByLabel('Company', { exact: true }).fill('Kora Hospitality Ltd')
  await page.getByLabel('First hotel').fill('Kora Victoria Island')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Kora Hotels Group' })).toBeVisible()
  return email
}

// Switches the page to dark mode the way a person's profile choice will.
export async function switchToDarkMode(page: Page) {
  await page.evaluate(() => localStorage.setItem('vento.theme', 'dark'))
  await page.reload()
}

// Fails the test on any WCAG 2.2 A/AA violation axe can detect, listing each one clearly. Waits for
// entrance animations to finish first, so contrast is measured on the settled page.
export async function expectAccessible(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== 'running' ||
          a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const problems = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).join('\n    ')}`,
  )
  expect(problems, `Accessibility problems on ${page.url()}`).toEqual([])
}
