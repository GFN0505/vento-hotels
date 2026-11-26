// The hotel form, shared by "Add a hotel" and hotel settings: values as typed, the checks on save,
// and (for settings) only what changed, so the audit log shows exactly that.
import { addPropertyFormSchema, DEFAULT_TIME_ZONE, isLgaOf, type Property } from '@vento/shared'

export type HotelForm = {
  name: string
  entityId: string
  addressLine1: string
  area: string
  state: string
  lga: string
  timeZone: string
  checkInTime: string
  checkOutTime: string
  // Only after go-live, when the owning company changes.
  reason: string
}

export type Problems = Partial<Record<keyof HotelForm | 'form', string>>

export const FIELD_ORDER: readonly (keyof HotelForm)[] = [
  'name',
  'entityId',
  'reason',
  'addressLine1',
  'area',
  'state',
  'lga',
  'timeZone',
  'checkInTime',
  'checkOutTime',
]

export function emptyForm(entityId: string): HotelForm {
  return {
    name: '',
    entityId,
    addressLine1: '',
    area: '',
    state: '',
    lga: '',
    timeZone: DEFAULT_TIME_ZONE,
    checkInTime: '14:00',
    checkOutTime: '12:00',
    reason: '',
  }
}

export function formFrom(hotel: Property): HotelForm {
  return {
    name: hotel.name,
    // A scheduled change shows as the company it's heading for (choosing the current one cancels).
    entityId: hotel.pendingEntity?.id ?? hotel.entityId,
    addressLine1: hotel.addressLine1 ?? '',
    area: hotel.area ?? '',
    state: hotel.state ?? '',
    lga: hotel.lga ?? '',
    timeZone: hotel.timeZone,
    checkInTime: hotel.checkInTime,
    checkOutTime: hotel.checkOutTime,
    reason: '',
  }
}

// The first message per field from the shared rules.
function problemsFrom(issues: readonly { path: PropertyKey[]; message: string }[]): Problems {
  const problems: Problems = {}
  for (const issue of issues) {
    const key = issue.path[0] as keyof HotelForm | undefined
    if (key && !problems[key]) problems[key] = issue.message
  }
  return problems
}

export function checkNew(form: HotelForm): Problems {
  const result = addPropertyFormSchema.safeParse(trimmed(form))
  return result.success ? {} : problemsFrom(result.error.issues)
}

function trimmed(form: HotelForm) {
  return {
    name: form.name.trim(),
    entityId: form.entityId,
    addressLine1: form.addressLine1.trim(),
    area: form.area.trim(),
    state: form.state,
    lga: form.lga,
    timeZone: form.timeZone,
    checkInTime: form.checkInTime,
    checkOutTime: form.checkOutTime,
  }
}

// Whether the owning company is changing (to another company than the current or scheduled one).
export function changesCompany(hotel: Property, form: HotelForm): boolean {
  return form.entityId !== (hotel.pendingEntity?.id ?? hotel.entityId)
}

// On a live hotel a move to another company waits for the next business date, and both the move
// and cancelling a waiting one (choosing the current company again) need a reason.
export function needsReason(hotel: Property, form: HotelForm): boolean {
  return hotel.liveSince !== null && changesCompany(hotel, form)
}

const TEXT_FIELDS = ['name', 'addressLine1', 'area', 'state', 'lga'] as const
const OTHER_FIELDS = ['timeZone', 'checkInTime', 'checkOutTime'] as const

// Settings: an address can be completed later but never cleared, and each part is checked by the
// same rules as a new hotel.
export function checkChanges(hotel: Property, form: HotelForm): Problems {
  const all = checkNew(form)
  const problems: Problems = {}
  for (const field of [...TEXT_FIELDS, ...OTHER_FIELDS]) {
    const before = field === 'name' ? hotel.name : (hotel[field] ?? '')
    const now = form[field].trim()
    // Left empty as it was (onboarding's hotel): fine, the address banner stays.
    if (!now && !before && field !== 'name') continue
    if (now !== before && all[field]) problems[field] = all[field]
  }
  if (form.lga && form.state && !isLgaOf(form.state, form.lga)) {
    problems.lga = 'Choose an LGA in this state'
  }
  if (needsReason(hotel, form) && form.reason.trim().length < 3) {
    problems.reason = 'Say why, in a few words'
  }
  return problems
}

export type HotelChanges = Partial<
  Record<
    (typeof TEXT_FIELDS)[number] | (typeof OTHER_FIELDS)[number] | 'entityId' | 'reason',
    string
  >
>

export function changesFrom(hotel: Property, form: HotelForm): HotelChanges {
  const changes: HotelChanges = {}
  for (const field of [...TEXT_FIELDS, ...OTHER_FIELDS]) {
    const before = field === 'name' ? hotel.name : (hotel[field] ?? '')
    const now = form[field].trim()
    if (now && now !== before) changes[field] = now
  }
  if (changesCompany(hotel, form)) {
    changes.entityId = form.entityId
    if (needsReason(hotel, form)) changes.reason = form.reason.trim()
  }
  return changes
}

// Anything typed that differs from the saved hotel, a cleared field included (Save then explains).
export function isDirty(hotel: Property, form: HotelForm): boolean {
  if (changesCompany(hotel, form)) return true
  return [...TEXT_FIELDS, ...OTHER_FIELDS].some((field) => {
    const before = field === 'name' ? hotel.name : (hotel[field] ?? '')
    return form[field].trim() !== before
  })
}
