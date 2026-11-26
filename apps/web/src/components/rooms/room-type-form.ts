// The room type sheet's form: values as typed, checked with the shared schema on save so the
// messages match the API's, and turned into the create or update input.
import {
  createRoomTypeSchema,
  type RoomBed,
  type RoomTypeView,
  roomTypeCodeSchema,
} from '@vento/shared'

export type TypeForm = {
  name: string
  code: string
  codeEdited: boolean
  bed: RoomBed
  sofaBed: boolean
  baseOccupancy: string
  maxAdults: string
  maxChildren: string
  sizeSqm: string
  amenities: string[]
}

export const FIELD_ORDER = ['name', 'code', 'baseOccupancy', 'maxAdults', 'maxChildren', 'sizeSqm']

export function formFrom(type: RoomTypeView | undefined): TypeForm {
  return {
    name: type?.name ?? '',
    code: type?.code ?? '',
    codeEdited: Boolean(type),
    bed: type?.bed ?? 'king',
    sofaBed: type?.sofaBed ?? false,
    baseOccupancy: String(type?.baseOccupancy ?? 2),
    maxAdults: String(type?.maxAdults ?? 2),
    maxChildren: String(type?.maxChildren ?? 0),
    sizeSqm: type?.sizeSqm ? String(Number(type.sizeSqm)) : '',
    amenities: type?.amenities ?? [],
  }
}

const count = (text: string) => (/^\d{1,2}$/.test(text.trim()) ? Number(text) : Number.NaN)

export function nameProblem(value: string) {
  if (!value.trim()) return 'Enter a name'
  return value.trim().length > 60 ? 'Keep the name under 60 characters' : undefined
}

export function codeProblem(value: string) {
  const result = roomTypeCodeSchema.safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message
}

export function countProblem(min: number, what: string) {
  return (value: string) => {
    const n = count(value)
    return Number.isNaN(n) || n < min || n > 20 ? `Enter ${min} to 20 ${what}` : undefined
  }
}

export function sizeProblem(value: string) {
  if (!value.trim()) return undefined
  return /^\d{1,4}(\.\d)?$/.test(value.trim()) && Number(value) > 0
    ? undefined
    : 'Enter the size in m², like 32 or 32.5'
}

// Every field's problem on save, keyed by field name. The shared schema adds the cross-field rule
// (base occupancy within max guests) once each field is fine on its own.
export function check(form: TypeForm, propertyId: string) {
  const problems: Record<string, string | undefined> = {
    name: nameProblem(form.name),
    code: codeProblem(form.code),
    baseOccupancy: countProblem(1, 'guests')(form.baseOccupancy),
    maxAdults: countProblem(1, 'adults')(form.maxAdults),
    maxChildren: countProblem(0, 'children')(form.maxChildren),
    sizeSqm: sizeProblem(form.sizeSqm),
  }
  if (Object.values(problems).some(Boolean)) return { problems, ok: false }
  const result = createRoomTypeSchema.safeParse(toInput(form, propertyId))
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? 'form')
      problems[field] ??= issue.message
    }
  }
  return { problems, ok: result.success }
}

export function toInput(form: TypeForm, propertyId: string) {
  return {
    propertyId,
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    bed: form.bed,
    sofaBed: form.sofaBed,
    baseOccupancy: count(form.baseOccupancy),
    maxAdults: count(form.maxAdults),
    maxChildren: count(form.maxChildren),
    sizeSqm: form.sizeSqm.trim() || null,
    amenities: form.amenities,
  }
}
