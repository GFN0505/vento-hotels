// What happens on every page when the hotel switch changes (spec: "When the hotel changes on a
// page"): the route stays, paging goes back to 1 and an open record sheet closes (it belonged to the
// old hotel), filters stay, focus moves to the page title and a polite live region says what's
// shown now. Pages don't repeat any of this.
import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { Scope } from '@/lib/scope'
import { useProperty } from './property-context'

const keyOf = (scope: Scope) => (scope.kind === 'all' ? 'all' : scope.hotel.id)
const RESET = ['page', 'sheet', 'id'] as const

export function HotelChange() {
  const { scope } = useProperty()
  const router = useRouter()
  const [said, setSaid] = useState('')
  const last = useRef<string | undefined>(undefined)
  const key = scope ? keyOf(scope) : undefined

  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to the scope's identity only.
  useEffect(() => {
    if (!scope || !key) return
    const before = last.current
    last.current = key
    if (before === undefined || before === key) return
    const search = router.latestLocation.search as Record<string, unknown>
    if (RESET.some((name) => search[name] !== undefined)) {
      void router.navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev }
          for (const name of RESET) delete next[name]
          return next
        },
        replace: true,
        resetScroll: false,
      } as never)
    }
    setSaid(scope.kind === 'all' ? 'Showing all hotels' : `Showing ${scope.hotel.name}`)
    // After the page has drawn the new hotel: keyboard and screen-reader users never land on nothing.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
      window.scrollTo({ top: 0 })
    })
  }, [key])

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {said}
    </p>
  )
}
