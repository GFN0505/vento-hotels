// Rooms (spec: docs/specs/stage-1-room-types-and-rooms.md). The page itself loads on demand.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { RoomsPage } from '@/components/rooms/rooms-page'
import type { OnSearch, RoomsSearch } from '@/components/rooms/rooms-search'

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : undefined
const oneOf = <T extends string>(value: unknown, options: readonly T[]) =>
  options.find((option) => option === value)

// Hand-written rather than zod: route options load with the first page (bundle-budget.json).
function readSearch(search: Record<string, unknown>): RoomsSearch {
  const floor = Number(search.floor)
  const page = Number(search.page)
  return {
    q: text(search.q)?.slice(0, 20),
    type: text(search.type),
    floor: search.floor !== '' && Number.isInteger(floor) ? floor : undefined,
    show: oneOf(search.show, ['accessible', 'archived', 'ooo'] as const),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    sheet: oneOf(search.sheet, ['builder', 'room', 'type'] as const),
    id: text(search.id),
  }
}

export const Route = createFileRoute('/_app/rates/rooms')({
  // The tab title as soon as navigation starts (components/shell/route-title.ts).
  staticData: { title: 'Rooms' },
  validateSearch: readSearch,
  component: RoomsRoute,
})

function RoomsRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  // The page never jumps to the top when a filter changes or a sheet opens.
  const onSearch: OnSearch = useCallback(
    (patch, options) =>
      void navigate({
        search: (prev) => ({ ...prev, page: undefined, ...patch }),
        replace: !options?.push,
        resetScroll: false,
      }),
    [navigate],
  )
  return <RoomsPage search={search} onSearch={onSearch} />
}
