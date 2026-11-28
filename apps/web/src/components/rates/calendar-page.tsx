// Rates & channels › Rate calendar (design #8, Rates tab; spec stage-1-rate-plans): 14 or 30 nights
// from the business date, one row per plan under each room type; own-price cells edit inline, ranges
// through Change dates. Phones show one room type, night by night. Read-only offline and for the
// front desk; the next pages are fetched ahead so they open offline too.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, type Property, type RatePlanView } from '@vento/shared'
import { CalendarRange } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { useMediaQuery } from '@/lib/media'
import { useOnline } from '@/offline/connection'
import { CalendarEmpty } from './calendar-empty'
import { CalendarGrid } from './calendar-grid'
import { CalendarLegend } from './calendar-legend'
import { type CellRef, pageFrom } from './calendar-model'
import { CalendarPhone } from './calendar-phone'
import type { CalendarSearch, OnCalendarSearch } from './calendar-search'
import { CalendarToolbar } from './calendar-toolbar'
import { CellDetail } from './cell-detail'
import { ChangeDatesSheet } from './change-dates-sheet'
import { CHANGE_DENIED_SHORT, dateRange, NEEDS_CONNECTION, perNight } from './format'
import { LiveBadge } from './plans-page'
import { calendarQuery, plansQuery, useRatesOverview } from './queries'
import { RatesHotel } from './rates-hotel'
import { RatesSkeleton } from './skeletons'
import { NoRoomsYet, RatesLoadError, RatesOffline } from './states'
import { useCellEditing } from './use-cell-editing'
import { useRateDates } from './use-rate-dates'

type Props = { search: CalendarSearch; onSearch: OnCalendarSearch }

export function CalendarPage(props: Props) {
  return (
    <RatesHotel title="Rate calendar" description="₦ per night, as each plan quotes it" calendar>
      {(hotel) => <HotelCalendar hotel={hotel} {...props} />}
    </RatesHotel>
  )
}

function HotelCalendar({ hotel, search, onSearch }: Props & { hotel: Property }) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const phone = !useMediaQuery('(min-width: 768px)')
  const wide = useMediaQuery('(min-width: 1024px)')
  const overview = useRatesOverview(hotel.id)
  const plans = useQuery(plansQuery(hotel.id))
  const o = overview.data
  const from = search.from ?? o?.property.businessDate
  const nights = phone ? 14 : (search.nights ?? 14)
  // Phones show one room type at a time: the chosen one, or the first.
  const typeId = search.type ?? (phone ? o?.roomTypes[0]?.id : undefined)
  const params = {
    propertyId: hotel.id,
    from,
    nights,
    roomTypeId: typeId,
    includeCorporate: Boolean(search.corporate),
  }
  const calendar = useQuery({
    ...calendarQuery(params),
    enabled: Boolean(from),
    placeholderData: keepPreviousData,
  })
  const rateDates = useRateDates()
  const editing = useCellEditing(rateDates)
  const [selected, setSelected] = useState<CellRef>()
  const loaded = calendar.isSuccess && !calendar.isPlaceholderData

  // The next pages, so paging is instant and the coming weeks open offline (spec: 60 nights kept).
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only when the view changes.
  useEffect(() => {
    if (!loaded || !online || !from) return
    for (const page of [1, 2, 3, 4]) {
      if (page * nights > 70) break
      const next = pageFrom(from, nights * page, 1)
      void queryClient.prefetchQuery(calendarQuery({ ...params, from: next }))
    }
  }, [loaded, online, from, nights, typeId, search.corporate])

  if (overview.isPending || (!calendar.data && calendar.isPending && !calendar.isError)) {
    return <RatesSkeleton title="Rate calendar" calendar />
  }
  if (overview.isError || calendar.isError || !o || !from) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Rate calendar" />
        <RatesLoadError
          what="rates"
          onRetry={() => void Promise.all([overview.refetch(), calendar.refetch()])}
        />
      </div>
    )
  }
  if (o.roomTypes.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Rate calendar" />
        <NoRoomsYet />
      </div>
    )
  }
  const data = calendar.data
  const planMap = new Map<string, RatePlanView>((plans.data?.items ?? []).map((p) => [p.id, p]))
  const canEdit = Boolean(data?.canEdit) && online
  const openSheet = (ref?: CellRef, to?: string) =>
    onSearch({ sheet: 'dates', plan: ref?.planId, date: ref?.date, to }, { push: true })
  // A season band opens Change dates on its dates from the business date on.
  const openSeason = (start: string, end: string) => {
    const first = [start, o.property.businessDate].sort().at(-1) ?? start
    openSheet({ typeId: '', planId: '', date: first }, end)
  }
  const empty = data?.roomTypes.every((t) => t.rows.length === 0)
  const shown = data?.roomTypes.flatMap((t) => t.rows) ?? []
  // Until the nights load, the header doesn't guess the plans' basis.
  const priced = data
    ? perNight({
        exclusive: shown.filter((row) => !row.pricesIncludeTaxes).length,
        total: shown.length,
      })
    : '₦ per night'
  const changeDates = (
    <Button
      variant="primary"
      size="lg"
      className="flex-none max-lg:h-11"
      disabled={!online || o.activePlans === 0}
      onClick={() => openSheet()}
    >
      <CalendarRange className="size-4" aria-hidden="true" />
      Change dates
    </Button>
  )
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Rate calendar"
        badge={<LiveBadge live={o.property.live} />}
        description={
          <span className="num">{`${priced} · ${dateRange(from, addDays(from, nights - 1))}`}</span>
        }
        actions={
          o.canEdit && !phone ? (
            <>
              {!online ? (
                <span className="self-center text-sm text-text-3">{NEEDS_CONNECTION}</span>
              ) : null}
              {changeDates}
            </>
          ) : null
        }
      />
      {o.canEdit ? null : <p className="-mt-2 text-text-2">{CHANGE_DENIED_SHORT}</p>}
      <RatesOffline updatedAt={calendar.dataUpdatedAt} />
      <CalendarToolbar
        overview={o}
        search={search}
        from={from}
        nights={nights}
        phone={phone}
        roomTypeId={typeId}
        changeDates={phone && o.canEdit ? changeDates : null}
        legend={<CalendarLegend compact={!wide} />}
        onSearch={onSearch}
      />
      {data && !empty ? (
        <>
          <CellDetail
            calendar={data}
            selected={selected}
            canEdit={canEdit}
            onChangeDate={openSheet}
          />
          {phone ? (
            <CalendarPhone
              calendar={data}
              plans={planMap}
              canEdit={canEdit}
              selected={selected}
              editing={editing}
              onSelect={setSelected}
            />
          ) : (
            <CalendarGrid
              calendar={data}
              plans={planMap}
              canEdit={canEdit}
              selected={selected}
              editing={editing}
              onSelect={setSelected}
              onSeason={canEdit ? openSeason : undefined}
            />
          )}
        </>
      ) : (
        <CalendarEmpty
          corporate={Boolean(search.corporate)}
          filtered={Boolean(search.type)}
          onClear={() => onSearch({ type: undefined, corporate: undefined })}
        />
      )}
      {search.sheet === 'dates' && o.canEdit && data ? (
        <ChangeDatesSheet
          overview={o}
          plans={plans.data?.items ?? []}
          initial={{
            planId: search.plan || undefined,
            date: search.date,
            to: search.to,
            typeId: search.type,
            from,
          }}
          rateDates={rateDates}
          onClose={() =>
            onSearch(
              { sheet: undefined, plan: undefined, date: undefined, to: undefined },
              { push: true },
            )
          }
        />
      ) : null}
      {rateDates.dialog}
    </div>
  )
}
