// Hotels and companies data. After any write, the hotel switch, these lists and Home's figures and
// checklist refresh together, so a new or archived hotel shows (or leaves) everywhere at once.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MAX_PAGE_SIZE } from '@vento/shared'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'

export const PAGE_SIZE = 25

export function useSetupRefresh() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.properties.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.entities.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.organization.home.key() }),
    ])
}

// The group's active companies, for the owning-company picker (a handful per group).
export function useActiveCompanies() {
  const me = useMe()
  return useQuery({
    ...orpc.entities.list.queryOptions({ input: { status: 'active', pageSize: MAX_PAGE_SIZE } }),
    enabled: me.can('setup.manage'),
  })
}
