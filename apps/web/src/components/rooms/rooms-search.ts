// The Rooms page's URL state: search, filters, page and which sheet is open, so a view can be
// shared or refreshed and the back button closes a sheet. Parsed in the route file by hand.
export type RoomsView = 'accessible' | 'archived' | 'ooo'
export type RoomsSheet = 'builder' | 'room' | 'type'

export type RoomsSearch = {
  q?: string | undefined
  type?: string | undefined
  floor?: number | undefined
  show?: RoomsView | undefined
  page?: number | undefined
  sheet?: RoomsSheet | undefined
  // The room or room type in the sheet; none means a new one.
  id?: string | undefined
}

// Filters replace the history entry; opening or closing a sheet adds one, so Back closes it.
export type OnSearch = (patch: Partial<RoomsSearch>, options?: { push?: boolean }) => void

export const PAGE_SIZE = 100
export const PHONE_PAGE_SIZE = 50

export function filtersOf(search: RoomsSearch) {
  return { q: search.q, type: search.type, floor: search.floor, show: search.show }
}

export const isFiltered = (search: RoomsSearch) =>
  Boolean(search.q || search.type || search.floor !== undefined || search.show)
