// The data people last saw, kept on the device (decision 0009, offline shell): who they are, their
// group, its hotels and Home's figures. When Vento can't be reached, pages open with this copy and
// say when it was saved. Only reference data is kept: never guest records or ID numbers. It's all
// cleared on sign-out and when a shared device is locked.
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'
import { clearAll, getItem, setItem } from './store'

const KEY = 'queries'
const SESSION_KEY = 'vento.lastSession'

// The API paths worth keeping. Everything else is fetched fresh. Rooms and rates are kept so their pages
// opens offline (read-only) and the front desk bricks can show rooms through a power cut; hotels and
// companies so their settings open read-only offline.
const KEPT = new Set([
  'organization.current',
  'organization.home',
  'properties.list',
  'properties.get',
  'entities.list',
  'roomTypes.list',
  'rooms.list',
  'rooms.summary',
  // Rate plans and the calendar pages already opened (and the ones fetched ahead): read-only offline.
  'ratePlans.list',
  'ratePlans.overview',
  'ratePlans.get',
  'rates.calendar',
])

type Saved = { savedAt: number; state: ReturnType<typeof dehydrate> }

function pathOf(queryKey: readonly unknown[]): string {
  const path = queryKey[0]
  return Array.isArray(path) ? path.join('.') : ''
}

export function isKept(queryKey: readonly unknown[]): boolean {
  return KEPT.has(pathOf(queryKey))
}

let savedAt: number | undefined

export const lastSavedAt = () => savedAt

// Before the first render: put the saved copy in the cache, marked as old so it refreshes online.
export async function restore(client: QueryClient) {
  const saved = await getItem<Saved>(KEY)
  if (!saved) return
  savedAt = saved.savedAt
  hydrate(client, saved.state)
  // Shown at once, but fetched again as soon as a page uses it: a copy saved seconds before a
  // reload can already be out of date (a hotel just archived, access just removed).
  void client.invalidateQueries({ refetchType: 'none' })
}

// Saves a little after the data changes, so a burst of requests writes once.
export function keepSaving(client: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.query.state.status !== 'success') return
    if (!isKept(event.query.queryKey)) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const state = dehydrate(client, {
        shouldDehydrateQuery: (query) => query.state.status === 'success' && isKept(query.queryKey),
      })
      savedAt = Date.now()
      void setItem(KEY, { savedAt, state } satisfies Saved)
    }, 1000)
  })
}

// Who was signed in, so the app can open without reaching Vento. Names and ids only.
export type SessionSnapshot = {
  user: { id: string; name: string; email: string }
  organizationId: string | undefined
}

export function rememberSession(snapshot: SessionSnapshot) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot))
  } catch {
    // Storage blocked: the app needs a connection to open, as before.
  }
}

export function rememberedSession(): SessionSnapshot | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SessionSnapshot) : undefined
  } catch {
    return undefined
  }
}

export async function clearSavedData(client?: QueryClient) {
  savedAt = undefined
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing kept.
  }
  client?.clear()
  await clearAll()
}
