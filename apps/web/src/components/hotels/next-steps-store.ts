// The hotels this person added on this device, so their settings page shows "Next steps" until
// every step is done or it's dismissed. `people` is how many could work there when it was added
// (group-wide people included), so inviting someone shows as done.
type Added = Record<string, { people: number | null }>

const KEY = 'vento.addedHotels'

function read(): Added {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Added
  } catch {
    return {}
  }
}

function write(added: Added) {
  try {
    localStorage.setItem(KEY, JSON.stringify(added))
  } catch {
    // Storage blocked: the card shows for this visit only.
  }
}

export function rememberAdded(id: string) {
  write({ ...read(), [id]: { people: null } })
}

export function addedHotel(id: string): { people: number | null } | undefined {
  return read()[id]
}

export function setBaseline(id: string, people: number) {
  const added = read()
  if (added[id]) write({ ...added, [id]: { people } })
}

export function forgetAdded(id: string) {
  const { [id]: _, ...rest } = read()
  write(rest)
}
