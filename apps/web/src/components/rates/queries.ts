// Rates data for one hotel. The overview (room types, business date, live, who may edit) is shared
// by every rates page, so switching tabs never waits for it twice.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MAX_PAGE_SIZE } from '@vento/shared'
import { orpc } from '@/lib/api'

export function overviewQuery(propertyId: string) {
  return orpc.ratePlans.overview.queryOptions({ input: { propertyId } })
}

export function useRatesOverview(propertyId: string) {
  return useQuery(overviewQuery(propertyId))
}

export function plansQuery(propertyId: string, archived = false) {
  return orpc.ratePlans.list.queryOptions({
    input: { propertyId, archived, pageSize: MAX_PAGE_SIZE },
  })
}

export function planQuery(id: string) {
  return orpc.ratePlans.get.queryOptions({ input: { id } })
}

export type CalendarParams = {
  propertyId: string
  from?: string | undefined
  nights: number
  roomTypeId?: string | undefined
  includeCorporate: boolean
}

export function calendarQuery({ from, roomTypeId, ...rest }: CalendarParams) {
  return orpc.rates.calendar.queryOptions({
    input: { ...rest, ...(from ? { from } : {}), ...(roomTypeId ? { roomTypeId } : {}) },
  })
}

// After any rates write: plans, the calendar, Rooms' Base rate column and Home's "Set rates".
export function useRatesRefresh() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.ratePlans.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.rates.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.roomTypes.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.organization.home.key() }),
    ])
}
