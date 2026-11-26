// The tab title changes the moment navigation starts, from the route's static title and the hotel
// in view (spec: hotel switch, "tab titles"), so a slow page download never leaves the old page's
// title in the tab. The page refines it when it mounts (useScopedTitle).
import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useMe } from '@/lib/me'
import { titleForRoute } from '@/lib/scope'
import { useProperty } from './property-context'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    // The page's name in the tab title, e.g. "Members and roles".
    title?: string
    // The same at every hotel: the tab names the group instead (Permissions and limits).
    groupWide?: boolean
  }
}

export function useTitleOnNavigate() {
  const router = useRouter()
  const { scope } = useProperty()
  const group = useMe().data?.organization.name
  // Read when navigation starts, without resubscribing on every change.
  const latest = useRef({ scope, group })
  latest.current = { scope, group }

  useEffect(
    () =>
      router.subscribe('onBeforeNavigate', (event) => {
        const matches = router.matchRoutes(event.toLocation)
        const page = [...matches].reverse().find((match) => match.staticData?.title)
        const title = titleForRoute(page?.staticData, latest.current.scope, latest.current.group)
        if (title) document.title = title
      }),
    [router],
  )
}
