// Settings › Members and roles (design #25, SetMembers). Search, filter and page live in the URL so
// a view can be shared or refreshed; the hotel comes from the top-bar switch.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { MembersPage } from '@/components/team/members-page'
import type { MembersSearch } from '@/components/team/members-search'

// Reads ?q=&filter=&page=&invite= and drops anything malformed. Hand-written rather than zod: route
// options load with the first page, and zod would add ~14 KB to it (apps/web/bundle-budget.json).
function readSearch(search: Record<string, unknown>): MembersSearch {
  const result: MembersSearch = {}
  if (typeof search.q === 'string' && search.q.trim()) result.q = search.q.trim().slice(0, 120)
  if (search.filter === 'admins' || search.filter === 'managers' || search.filter === 'staff') {
    result.filter = search.filter
  }
  const page = Number(search.page)
  if (Number.isInteger(page) && page > 1) result.page = page
  if (typeof search.invite === 'string' && search.invite) result.invite = search.invite.slice(0, 40)
  return result
}

export const Route = createFileRoute('/_app/settings/members')({
  validateSearch: readSearch,
  component: MembersRoute,
})

function MembersRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const onSearch = useCallback(
    (patch: Partial<MembersSearch>) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), resetScroll: false }),
    [navigate],
  )
  return <MembersPage search={search} onSearch={onSearch} />
}
