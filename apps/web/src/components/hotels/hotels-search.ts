// What Settings › Hotels keeps in the URL: the list's filter, search and page, and the Add a hotel
// sheet. A hotel to open (?hotel= from Home or a link) is handled by the shell for every page.
export type HotelsSearch = {
  show?: 'archived' | undefined
  q?: string | undefined
  page?: number | undefined
  sheet?: 'add' | undefined
}

export type OnHotelsSearch = (patch: Partial<HotelsSearch>, options?: { push?: boolean }) => void
