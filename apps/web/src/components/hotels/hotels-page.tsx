// Settings › Hotels (spec: stage-1-hotels-and-companies.md). The top-bar hotel switch decides what
// shows: with "All hotels", the list; with one hotel, that hotel's settings. Someone who sees one
// hotel always gets its settings. "Add a hotel" heads the list, and sits beside "All hotels" above a
// hotel's settings, where Save is the page's main action.
import { useQuery } from '@tanstack/react-query'
import type { Property } from '@vento/shared'
import { Building2, Plus } from 'lucide-react'
import { useEffect } from 'react'
import { FormSkeleton } from '@/components/settings/load-states'
import { SettingsOffline } from '@/components/settings/offline-note'
import { useProperty } from '@/components/shell/property-context'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { usePageTitle } from '@/lib/title'
import { useOnline } from '@/offline/connection'
import { AddHotelSheet } from './add-hotel-sheet'
import { HotelSettings } from './hotel-settings'
import { HotelsList } from './hotels-list'
import type { HotelsSearch, OnHotelsSearch } from './hotels-search'

type Props = { search: HotelsSearch; onSearch: OnHotelsSearch }

export function HotelsPage({ search, onSearch }: Props) {
  const me = useMe()
  const online = useOnline()
  const { properties, current, allHotels, canSeeAll, select } = useProperty()
  // The hotel switch's own list (same query as the shell), to tell loading from no hotels.
  const hotels = useQuery(orpc.properties.list.queryOptions({ input: { pageSize: 100 } }))
  const list = canSeeAll && allHotels
  usePageTitle(
    list ? 'All hotels · Hotels' : current ? `${current.name} · Hotel settings` : 'Hotels',
  )

  // ?hotel= from Home or a link: choose that hotel in the top bar, then tidy the address.
  useEffect(() => {
    if (!search.hotel || properties.length === 0) return
    if (properties.some((p) => p.id === search.hotel)) select(search.hotel)
    onSearch({ hotel: undefined })
  }, [search.hotel, properties, select, onSearch])

  if (me.isPending) return <FormSkeleton />
  const canManage = me.can('setup.manage')
  if (!canManage && !me.can('property.operating_times')) return <NoAccess what="hotel settings" />

  const add = () => onSearch({ sheet: 'add' }, { push: true })
  const addButton = canManage ? (
    <Button variant="primary" size="lg" className="max-lg:h-11" disabled={!online} onClick={add}>
      <Plus className="size-4" aria-hidden="true" />
      Add a hotel
    </Button>
  ) : null

  function open(hotel: Property) {
    select(hotel.id)
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('main h1')?.focus()
      window.scrollTo({ top: 0 })
    })
  }

  return (
    <>
      {list ? (
        <div className="flex flex-col gap-5">
          <SettingsOffline />
          <HotelsList
            search={search}
            onSearch={onSearch}
            onOpen={open}
            addButton={addButton}
            online={online}
          />
        </div>
      ) : current ? (
        <HotelSettings key={current.id} hotel={current} onAdd={canManage ? add : undefined} />
      ) : hotels.isPending ? (
        <FormSkeleton />
      ) : (
        <EmptyState icon={Building2} tone="brand">
          You're not on a hotel yet. An owner can give you access from Settings.
        </EmptyState>
      )}
      {search.sheet === 'add' && canManage ? (
        <AddHotelSheet onClose={() => onSearch({ sheet: undefined })} />
      ) : null}
    </>
  )
}
