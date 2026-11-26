// Rooms data for one hotel. Room types come with the archived ones (one small list, split on the
// page), so the page, the builder and the sheets share one cached copy.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MAX_PAGE_SIZE } from '@vento/shared'
import { orpc } from '@/lib/api'

export function roomTypesQuery(propertyId: string) {
  return orpc.roomTypes.list.queryOptions({
    input: { propertyId, includeArchived: true, pageSize: MAX_PAGE_SIZE },
  })
}

export function useRoomTypes(propertyId: string) {
  const query = useQuery(roomTypesQuery(propertyId))
  const all = query.data?.items ?? []
  return {
    ...query,
    active: all.filter((type) => !type.archivedAt),
    archived: all.filter((type) => type.archivedAt),
  }
}

export function useRoomsSummary(propertyId: string) {
  return useQuery(orpc.rooms.summary.queryOptions({ input: { propertyId } }))
}

// After any rooms write: the lists, the counts and Home's setup step and room counts.
export function useRoomsRefresh() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.roomTypes.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.rooms.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.organization.home.key() }),
    ])
}
