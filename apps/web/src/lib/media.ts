// Whether a CSS media query matches, kept up to date. For layouts that should not even render the
// other variant (e.g. a 384-cell grid on a phone), where hiding it with CSS isn't enough.
import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
