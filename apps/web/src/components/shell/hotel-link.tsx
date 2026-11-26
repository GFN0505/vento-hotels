// Links that name a hotel (spec: "Deep links and the URL"): any page accepts ?hotel=<id> or
// ?hotel=all. The shell selects it before the page loads anything, then tidies the address bar.
// A hotel the person can't open gets one neutral message, whatever the reason, so a link never
// reveals whether a hotel exists.
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { orpc } from '@/lib/api'
import { hotelGoneReason, propertyIdOf, resolveHotelLink } from '@/lib/scope'
import { noteHotelGone, useProperty } from './property-context'

// 'reloading': the hotel isn't in the switch yet, so the list is fetched once more before saying no.
// 'deferred': that fetch couldn't reach Vento; the link waits (the page shows meanwhile) until the
// list loads again, rather than refusing a hotel that may well exist.
type Stage = 'start' | 'reloading' | 'deferred'

// True while a ?hotel= link is being handled: the page waits, so its first request is for the
// hotel the link names.
export function useHotelLink(): boolean {
  const param = useLocation({
    select: (location) => {
      const value = (location.search as Record<string, unknown>).hotel
      return typeof value === 'string' && value ? value.slice(0, 40) : undefined
    },
  })
  const { properties, canSeeAll, scope, ready, select, selectAll } = useProperty()
  const router = useRouter()
  const queryClient = useQueryClient()
  const stage = useRef<{ param: string | undefined; stage: Stage }>({ param, stage: 'start' })
  const [deferred, setDeferred] = useState(false)
  if (stage.current.param !== param) stage.current = { param, stage: 'start' }

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-checked whenever the hotel list changes.
  useEffect(() => {
    if (!param || !ready) return
    // From the full address, so the page's own parameters (e.g. ?register=) survive.
    const tidy = () => {
      const { hotel: _hotel, ...rest } = router.latestLocation.search as Record<string, unknown>
      void router.navigate({
        to: router.latestLocation.pathname,
        search: rest,
        replace: true,
      } as never)
    }
    function refuse() {
      const showing = scope?.kind === 'hotel' ? scope.hotel.name : 'all hotels'
      toast.info(`That link is for a hotel you can't open. Showing ${showing}.`)
      setDeferred(false)
      tidy()
    }
    // Selected only once the switch itself has the hotel, so it never falls back first.
    const target = resolveHotelLink(param, properties, canSeeAll)
    if (target.kind !== 'refused') {
      if (target.kind === 'all') selectAll({ moveFocus: true })
      else select(target.id, { moveFocus: true })
      setDeferred(false)
      tidy()
      return
    }
    const now = stage.current
    if (now.stage === 'reloading') return
    if (now.stage === 'deferred') {
      // The list has loaded again without the hotel: now it's a no.
      refuse()
      return
    }
    now.stage = 'reloading'
    // Refreshes the switch's own query: when that has the hotel, this effect runs again.
    void queryClient
      .fetchQuery({
        ...orpc.properties.list.queryOptions({ input: { pageSize: 100 } }),
        staleTime: 0,
      })
      .then(
        (fresh) => {
          if (stage.current !== now) return
          if (resolveHotelLink(param, fresh.items, canSeeAll).kind === 'refused') refuse()
        },
        () => {
          if (stage.current !== now) return
          now.stage = 'deferred'
          setDeferred(true)
        },
      )
  }, [param, ready, properties])

  return Boolean(param) && !deferred
}

// A list answered that the chosen hotel isn't there for this person any more (access removed, or
// archived elsewhere): note why, and reload the hotel list, so the switch falls back and says so.
export function useHotelGoneRefresh() {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return
        const reason = hotelGoneReason(event.action.error)
        if (!reason) return
        const id = propertyIdOf(event.query)
        if (id) noteHotelGone(id, reason)
        void queryClient.invalidateQueries({ queryKey: orpc.properties.list.key() })
      }),
    [queryClient],
  )
}
