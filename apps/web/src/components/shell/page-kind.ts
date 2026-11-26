// Whether the page on screen is group-wide (the same at every hotel, e.g. Permissions and limits).
// PageHeader registers it; the top bar says the switch doesn't change this page, and the
// hotel-change handler leaves focus and announcements alone there.
import { useEffect, useSyncExternalStore } from 'react'

let groupWide = 0
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}

export const isGroupWidePage = () => groupWide > 0

export function useRegisterGroupWide(active: boolean) {
  useEffect(() => {
    if (!active) return
    groupWide += 1
    emit()
    return () => {
      groupWide -= 1
      emit()
    }
  }, [active])
}

export function useGroupWidePage(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isGroupWidePage,
    () => false,
  )
}
