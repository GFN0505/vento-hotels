// What Settings › Hotels keeps in the URL: the list's filter, search and page, the Add a hotel
// sheet, and a hotel to open (from Home or a link), which is chosen in the top bar on arrival.
export type HotelsSearch = {
  show?: 'archived' | undefined
  q?: string | undefined
  page?: number | undefined
  sheet?: 'add' | undefined
  hotel?: string | undefined
}

export type OnHotelsSearch = (patch: Partial<HotelsSearch>, options?: { push?: boolean }) => void
