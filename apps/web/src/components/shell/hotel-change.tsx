// What happens on every page when the hotel switch changes (spec: "When the hotel changes on a
// page"): the route stays, paging goes back to 1 and an open record sheet closes (it belonged to the
// old hotel), filters stay, a polite live region says what's shown now, and for in-page controls
// focus moves to the page title. Pages don't repeat any of this.
import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { nextAnnouncement, type Scope } from '@/lib/scope'
import { isGroupWidePage } from './page-kind'
import { useProperty } from './property-context'

const keyOf = (scope: Scope) => (scope.kind === 'all' ? 'all' : scope.hotel.id)
// What belongs to the old hotel: the page number, an open record sheet, and filters that name the
// old hotel's records (a room type). Search text and other filters stay.
const RESET = ['page', 'sheet', 'id', 'type'] as const

export function HotelChange() {
  const { scope, takeFocusRequest } = useProperty()
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
      // From the full address (not a route's own search), so other parameters survive.
      const next = { ...search }
      for (const name of RESET) delete next[name]
      void router.navigate({
        to: router.latestLocation.pathname,
        search: next,
        replace: true,
        resetScroll: false,
      } as never)
    }
    // Group-wide pages are the same at every hotel: nothing to say, and focus stays put.
    if (isGroupWidePage()) {
      takeFocusRequest()
      return
    }
    const text = scope.kind === 'all' ? 'Showing all hotels' : `Showing ${scope.hotel.name}`
    setSaid((previous) => nextAnnouncement(previous, text))
    // After the page has drawn the new hotel. Only for in-page controls (a hotel row, a link): the
    // top-bar select keeps focus, since its arrow keys change hotel one press at a time.
    requestAnimationFrame(() => {
      if (!takeFocusRequest()) return
      window.scrollTo({ top: 0 })
      focusTitle(Date.now() + 2000)
    })
  }, [key])

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {said}
    </p>
  )
}

// Focuses the page title. A page that shows a skeleton first replaces its title as data arrives,
// which drops focus to the page itself: follow it to the new title for a moment, unless the person
// has moved focus somewhere else meanwhile. Never pulls focus out of an open dialog.
function focusTitle(until: number, first = true) {
  const active = document.activeElement
  if (active?.closest('dialog[open]')) return
  const lost = !active || active === document.body
  const onTitle = active instanceof HTMLElement && active.matches('main h1')
  if (!first && !lost && !onTitle) return
  const title = document.querySelector<HTMLElement>('main h1')
  if (title && active !== title) title.focus({ preventScroll: true })
  if (Date.now() < until) requestAnimationFrame(() => focusTitle(until, false))
}
