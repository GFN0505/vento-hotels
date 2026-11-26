// The people list for the page: search, role filter and page from the URL, and the hotel in view.
// With a hotel, the server also says how many of its people have whole-group access, whatever the
// filters ("including 2 with access to the whole group").
import { useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/api'
import { keepWithinHotel } from '@/lib/scope'
import { MEMBERS_PAGE_SIZE, type MembersSearch } from './members-search'

export function useMembers(search: MembersSearch, hotelId: string | undefined, enabled: boolean) {
  return useQuery({
    ...orpc.members.list.queryOptions({
      input: {
        search: search.q,
        filter: search.filter,
        page: search.page ?? 1,
        pageSize: MEMBERS_PAGE_SIZE,
        propertyId: hotelId,
      },
    }),
    enabled,
    placeholderData: keepWithinHotel(hotelId),
  })
}

export type MembersQuery = ReturnType<typeof useMembers>
