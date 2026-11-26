// Links that name a hotel (spec: "Deep links and the URL"): any page accepts ?hotel=<id> or
// ?hotel=all. The shell selects it before the page loads anything, then tidies the address bar.
// A hotel the person can't open gets one neutral message, whatever the reason, so a link never
// reveals whether a hotel exists.
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { orpc } from '@/lib/api'
import { isHotelGone, resolveHotelLink } from '@/lib/scope'
import { useProperty } from './property-context'

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
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // biome-ignore lint/correctness/useExhaustiveDependencies: handled once per link, when the switch is ready.
  useEffect(() => {
    if (!param || !ready) return
    let cancelled = false
    const tidy = () =>
      void navigate({
        to: '.',
        search: ({ hotel: _hotel, ...rest }: Record<string, unknown>) => rest,
        replace: true,
      } as never)
    void (async () => {
      let target = resolveHotelLink(param, properties, canSeeAll)
      // A hotel added since the switch loaded: reload the list once before saying no.
      if (target.kind === 'refused') {
        const fresh = await queryClient
          .fetchQuery({
            ...orpc.properties.list.queryOptions({ input: { pageSize: 100 } }),
            staleTime: 0,
          })
          .catch(() => undefined)
        if (cancelled) return
        if (fresh) target = resolveHotelLink(param, fresh.items, canSeeAll)
      }
      if (target.kind === 'all') selectAll()
      else if (target.kind === 'hotel') select(target.id)
      else {
        const showing = scope?.kind === 'hotel' ? scope.hotel.name : 'all hotels'
        toast.info(`That link is for a hotel you can't open. Showing ${showing}.`)
      }
      tidy()
    })()
    return () => {
      cancelled = true
    }
  }, [param, ready])

  return Boolean(param)
}

// A list answered that the chosen hotel isn't there for this person any more (access removed, or
// archived elsewhere): reload the hotel list, so the switch falls back and says so (PropertyProvider).
export function useHotelGoneRefresh() {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return
        if (!isHotelGone(event.action.error)) return
        void queryClient.invalidateQueries({ queryKey: orpc.properties.list.key() })
      }),
    [queryClient],
  )
}
