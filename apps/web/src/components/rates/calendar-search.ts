// The rate calendar's URL state: the first night, 14 or 30 nights, a room type, corporate plans,
// and the Change dates sheet with what it opens on.
export type CalendarSearch = {
  from?: string | undefined
  nights?: 30 | undefined
  type?: string | undefined
  corporate?: true | undefined
  sheet?: 'dates' | undefined
  plan?: string | undefined
  date?: string | undefined
  // The last night, when Change dates opens on a range (a season).
  to?: string | undefined
}

export type OnCalendarSearch = (
  patch: Partial<CalendarSearch>,
  options?: { push?: boolean },
) => void
