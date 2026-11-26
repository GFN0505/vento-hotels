// Whether Vento can be reached right now. The browser's own online flag misses the common Nigerian
// case of Wi-Fi up but no internet, so a request that fails to reach the API also counts as
// offline, and the next one that succeeds brings it back.
import { useSyncExternalStore } from 'react'

let reachable = typeof navigator === 'undefined' ? true : navigator.onLine
const listeners = new Set<() => void>()

function set(value: boolean) {
  if (value === reachable) return
  reachable = value
  for (const listener of listeners) listener()
}

export const markReachable = () => set(true)
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
