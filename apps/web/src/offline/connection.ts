// Whether Vento can be reached right now. The browser's own online flag misses the common Nigerian
// case of Wi-Fi up but no internet, so a request that fails to reach the API also counts as
// offline, and the next one that succeeds brings it back.
import { useSyncExternalStore } from 'react'

let reachable = typeof navigator === 'undefined' ? true : navigator.onLine
let since: number | undefined = reachable ? undefined : Date.now()
const listeners = new Set<() => void>()

function set(value: boolean) {
  if (value === reachable) return
  reachable = value
  since = value ? undefined : Date.now()
  for (const listener of listeners) listener()
}

// A reply can land just after the connection drops (it was already on its way); while the browser
// itself says it's offline, that reply doesn't prove Vento can be reached.
export const markReachable = () => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  set(true)
}
export const markUnreachable = () => set(false)

if (typeof window !== 'undefined') {
  window.addEventListener('online', markReachable)
  window.addEventListener('offline', markUnreachable)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => reachable)
}

export const isOnline = () => reachable

// When Vento stopped being reachable, for "Offline since 17:32".
export const offlineSince = () => since
