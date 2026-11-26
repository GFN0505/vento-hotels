// Everyone who works at one hotel, for the facts above the list: how many of them have whole-group
// access, and whether anyone works only there. Separate from the paged, filtered list, so the
// description doesn't change while someone searches.
import { useQuery } from '@tanstack/react-query'
import { MAX_PAGE_SIZE } from '@vento/shared'
import { orpc } from '@/lib/api'

export function useHotelPeople(propertyId: string | undefined, enabled: boolean) {
  const query = useQuery({
    ...orpc.members.list.queryOptions({ input: { propertyId, pageSize: MAX_PAGE_SIZE } }),
    enabled: enabled && propertyId !== undefined,
  })
  const items = query.data?.items
  // A hotel with more people than one page has people of its own; no need to count further.
  const complete = Boolean(query.data && query.data.total <= query.data.items.length)
  return {
    wholeGroup: items?.filter((member) => member.allProperties).length,
    onlyWholeGroup: Boolean(complete && items?.every((member) => member.allProperties)),
  }
}
