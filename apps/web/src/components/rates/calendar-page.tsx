// Rates & channels › Rate calendar (design #8, Rates tab; spec stage-1-rate-plans): 14 or 30 nights
// from the business date, one row per plan under each room type; own-price cells edit inline, ranges
// through Change dates. Phones show one room type, night by night. Read-only offline and for the
// front desk; the next pages are fetched ahead so they open offline too.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, type Property, type RatePlanView } from '@vento/shared'
import { CalendarRange, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { useMediaQuery } from '@/lib/media'
import { useOnline } from '@/offline/connection'
import { CalendarGrid } from './calendar-grid'
import { type CellRef, pageFrom } from './calendar-model'
import { CalendarPhone } from './calendar-phone'
import type { CalendarSearch, OnCalendarSearch } from './calendar-search'
import { CalendarToolbar } from './calendar-toolbar'
import { CellDetail } from './cell-detail'
import { ChangeDatesSheet } from './change-dates-sheet'
import { dateRange, NEEDS_CONNECTION, PER_NIGHT_EXCL } from './format'
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
    <RatesHotel title="Rate calendar" description={PER_NIGHT_EXCL} calendar>
      {(hotel) => <HotelCalendar hotel={hotel} {...props} />}
    </RatesHotel>
  )
}

function HotelCalendar({ hotel, search, onSearch }: Props & { hotel: Property }) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const phone = !useMediaQuery('(min-width: 768px)')
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
  const openSheet = (ref?: CellRef) =>
    onSearch({ sheet: 'dates', plan: ref?.planId, date: ref?.date }, { push: true })
  const empty = data?.roomTypes.every((t) => t.rows.length === 0)
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Rate calendar"
        badge={<LiveBadge live={o.property.live} />}
        description={
          <span className="num">{`${PER_NIGHT_EXCL} · ${dateRange(from, addDays(from, nights - 1))}`}</span>
        }
        actions={
          o.canEdit ? (
            <>
              {!online ? (
                <span className="self-center text-sm text-text-3">{NEEDS_CONNECTION}</span>
              ) : null}
              <Button
                variant="primary"
                size="lg"
                className="max-lg:h-11"
                disabled={!online || o.activePlans === 0}
                onClick={() => openSheet()}
              >
                <CalendarRange className="size-4" aria-hidden="true" />
                Change dates
              </Button>
            </>
          ) : null
        }
      />
      <RatesOffline />
      <CalendarToolbar
        overview={o}
        search={search}
        from={from}
        nights={nights}
        phone={phone}
        roomTypeId={typeId}
        onSearch={onSearch}
      />
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-3">
        <span className="inline-flex items-center gap-1">
          <Link2 className="size-3.5" aria-hidden="true" /> derived plan, edit its parent
        </span>
        <span>MIN = minimum stay · CTA = closed to arrival</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-pri" /> price set for that
          date
        </span>
      </p>
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
          initial={{ planId: search.plan, date: search.date, typeId: search.type, from }}
          rateDates={rateDates}
          onClose={() =>
            onSearch({ sheet: undefined, plan: undefined, date: undefined }, { push: true })
          }
        />
      ) : null}
      {rateDates.dialog}
    </div>
  )
}

function CalendarEmpty({
  filtered,
  corporate,
  onClear,
}: {
  filtered: boolean
  corporate: boolean
  onClear: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-card">
      <p className="max-w-sm text-text-2">
        {filtered || corporate
          ? 'No rate plans match these filters.'
          : 'No rate plans yet. A rate plan sets the price and conditions for a room type.'}
      </p>
      {filtered || corporate ? (
        <Button className="max-lg:h-11" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
