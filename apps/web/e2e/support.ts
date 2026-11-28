// Shared helpers for browser tests: reading emails from the local outbox, signing in, setting up a
// hotel group, and the accessibility check every page must pass (docs/UX-STANDARD.md, section 5).
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'
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
  const email = `owner.${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.test`
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
  await expect(
    page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible()
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
  // Settled means no entrance animation running, checked again a moment later: content that arrives
  // from the API after the first check starts its own fade-in, and contrast mid-fade isn't real.
  const settled = () =>
    page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== 'running' ||
            a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
        ),
    )
  await settled()
  await new Promise((resolve) => setTimeout(resolve, 300))
  await settled()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const problems = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).join('\n    ')}`,
  )
  expect(problems, `Accessibility problems on ${page.url()}`).toEqual([])
  // Nothing wider than the screen (docs/UX-STANDARD.md, section 6): a long email or name that
  // pushes the page sideways also zooms phones out and hides bottom sheets.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `Page scrolls sideways on ${page.url()}`).toBeLessThanOrEqual(0)
}

// On an empty Rooms page (the builder): Standard Queen 301–314 and Deluxe King 401–414, with 414
// switched to Standard Queen in the preview; 28 rooms in all.
export async function buildRooms(page: Page) {
  await page.getByLabel('Name', { exact: true }).first().fill('Standard Queen')
  await page.getByLabel('Bed').first().selectOption('queen')
  await page.getByRole('button', { name: 'Add type' }).click()
  await page.getByLabel('Name', { exact: true }).nth(1).fill('Deluxe King')
  await page.getByLabel('Max guests').nth(1).fill('3')
  await page.getByLabel('First floor, line 1').fill('3')
  await page.getByLabel('Last floor, line 1').fill('3')
  await page.getByLabel('Last number, line 1').fill('14')
  await page.getByRole('button', { name: 'Add line' }).click()
  await page.getByLabel('Line 2 · Room type').selectOption({ label: 'Deluxe King' })
  await page.getByLabel('First floor, line 2').fill('4')
  await page.getByLabel('Last floor, line 2').fill('4')
  await page.getByLabel('Last number, line 2').fill('14')
  // Room 414 becomes a Standard Queen in the preview.
  await page.getByRole('button', { name: 'Room 414, Deluxe King' }).click()
  await page.getByLabel('Type', { exact: true }).selectOption({ label: 'Standard Queen' })
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Create 28 rooms' }).click()
  await expect(page.getByText('28 rooms created at Kora Victoria Island')).toBeVisible()
}

// A plain square PNG of one colour, e.g. a hotel logo to upload.
export function solidPng(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), 8 + data.length)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x3c)])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Loads the demo group (docs/journeys/README.md) under its own name and email domain, so specs
// can share the test database. Returns the domain people sign in with.
export function seedDemoGroup(tag: string, password: string): string {
  const run = `${tag}-${Date.now().toString(36)}`
  const domain = `kora-${run}.example`
  execFileSync('node', [fileURLToPath(new URL('../../api/src/seed/cli.ts', import.meta.url))], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ALLOW_DEV_GUEST_DATA_KEY: 'true',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      DEMO_PASSWORD: password,
      DEMO_SLUG: `kora-${run}`,
      DEMO_EMAIL_DOMAIN: domain,
    },
    stdio: 'pipe',
  })
  return domain
}

// Picks an option in a Combobox (components/ui/combobox.tsx) by typing part of it, as people do.
export async function choose(scope: Page | Locator, label: string, option: string) {
  const box = scope.getByRole('combobox', { name: label, exact: true })
  await box.fill(option)
  await scope.getByRole('option', { name: option, exact: true }).click()
  await expect(box).toHaveValue(option)
}
