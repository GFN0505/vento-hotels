// The offline shell (decision 0009): once someone has used Vento on a device, it opens without a
// connection, shows what was saved with a clear offline banner, and recovers by itself. Signing out
// leaves nothing behind. Runs against the production build, where the service worker lives.
import { expect, type Page, test } from '@playwright/test'
import { expectAccessible, signUpOwnerWithGroup } from './support'

const greeting = /^Good (morning|afternoon|evening)/

// The app is kept on the device and the data last seen is saved (a moment after it loads).
async function readyForOffline(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        // Only look once the app has made its database: opening it first would create an empty one.
        const names = await indexedDB.databases()
        if (!names.some((db) => db.name === 'vento')) return false
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open('vento')
          request.onsuccess = () => {
            const db = request.result
            if (!db.objectStoreNames.contains('kv')) {
              db.close()
              return resolve(false)
            }
            const get = db.transaction('kv').objectStore('kv').get('queries')
            get.onsuccess = () => {
              db.close()
              resolve(Boolean(get.result))
            }
            get.onerror = () => {
              db.close()
              resolve(false)
            }
          }
          request.onerror = () => resolve(false)
        })
      }),
    )
    .toBe(true)
}

test('opens offline with what was saved, then recovers', async ({ page, context }, testInfo) => {
  await signUpOwnerWithGroup(page, `offline-${testInfo.project.name}`)
  await expect(
    page.getByRole('heading', { name: 'Kora Victoria Island', exact: true }),
  ).toBeVisible()
  await readyForOffline(page)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: greeting })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: "You're offline." })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Kora Victoria Island', exact: true }),
  ).toBeVisible()
  await expectAccessible(page)

  await context.setOffline(false)
  await expect(page.getByText("You're offline.")).toHaveCount(0)
})

test('the banner appears as soon as the connection drops', async ({ page, context }, testInfo) => {
  await signUpOwnerWithGroup(page, `offline-live-${testInfo.project.name}`)
  await context.setOffline(true)
  await expect(page.getByText("You're offline.")).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText("You're offline.")).toHaveCount(0)
})

test('signing out leaves nothing to open offline', async ({ page, context }, testInfo) => {
  await signUpOwnerWithGroup(page, `offline-signout-${testInfo.project.name}`)
  await readyForOffline(page)
  await page.getByRole('button', { name: /^Account:/ }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  expect(await page.evaluate(() => localStorage.getItem('vento.lastSession'))).toBeNull()

  // Offline, the app still opens, at sign-in, with nobody's data on it.
  await context.setOffline(true)
  await page.goto('/sign-in')
  await expect(page.getByLabel('Work email')).toBeVisible()
  await page.goto('/').catch(() => {
    // The app sends a signed-out visitor on to sign-in, which can cut this load short.
  })
  await expect(page).toHaveURL(/\/sign-in/)
  await expect(page.getByRole('heading', { name: greeting })).toHaveCount(0)
})
