import { expect, test } from '@playwright/test'

test('warns when Caps Lock is on in a password field', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Hardware keyboards only')
  await page.goto('/sign-in')
  const password = page.getByLabel('Password', { exact: true })
  await password.focus()
  const key = (capsLock: boolean) =>
    password.evaluate((input, on) => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'A',
          bubbles: true,
          modifierCapsLock: on,
        } as KeyboardEventInit),
      )
    }, capsLock)
  await key(true)
  await expect(page.getByText('Caps Lock is on')).toBeVisible()
  await key(false)
  await expect(page.getByText('Caps Lock is on')).toHaveCount(0)
})
