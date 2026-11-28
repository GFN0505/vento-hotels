// The registration form's pure parts (spec: "Registration step"), shared by the check-in sheet and
// the walk-in page: the form's values as typed, which fields the rule set asks for, the first
// problem per field, the input the API takes, and the warnings. No React, so it is tested alone.
import {
  type CheckInPrepare,
  ECOWAS_NATIONS,
  type IdType,
  idNumberProblem,
  isEcowas,
  isForeign,
  MISSING_FIELD_MESSAGES,
  NIGERIAN_ID_TYPES,
  type PortOfEntry,
  type RegistrationField,
  type RegistrationInput,
  registrationWarnings,
  type VisaType,
  type VisitPurpose,
} from '@vento/shared'

export type RegistrationForm = {
  lead: boolean
  title: string
  firstName: string
  lastName: string
  nationality: string
  dateOfBirth: string
  addressLine: string
  addressCity: string
  addressRegion: string
  addressCountry: string
  purpose: VisitPurpose | ''
  vehiclePlate: string
  occupation: string
  idType: IdType | ''
  idNumber: string
  // Keep the earlier registration's number (it stays on the server): "Same NIN as last stay".
  reuseFrom: string
  reusedMasked: string
  idCountry: string
  idExpiry: string
  visaType: VisaType | ''
  visaTypeText: string
  visaNumber: string
  visaValidUntil: string
  entryDate: string
  portOfEntry: PortOfEntry | ''
  portOfEntryText: string
  arrivingFrom: string
  nextDestination: string
}

export type Rules = Pick<CheckInPrepare['rules'], 'lead' | 'foreign'>

export function emptyRegistration(
  guest: { title?: string | null; firstName: string; lastName: string; nationality: string },
  lead = true,
): RegistrationForm {
  const foreign = isForeign(guest.nationality)
  return {
    lead,
    title: guest.title ?? '',
    firstName: guest.firstName,
    lastName: guest.lastName,
    nationality: guest.nationality,
    dateOfBirth: '',
    addressLine: '',
    addressCity: '',
    addressRegion: '',
    addressCountry: guest.nationality,
    purpose: '',
    vehiclePlate: '',
    occupation: '',
    idType: foreign ? 'passport' : '',
    idNumber: '',
    reuseFrom: '',
    reusedMasked: '',
    idCountry: foreign ? guest.nationality : '',
    idExpiry: '',
    // ECOWAS citizens need no visa: preset, and offered only to them.
    visaType: foreign && isEcowas(guest.nationality) ? 'not_required' : '',
    visaTypeText: '',
    visaNumber: '',
    visaValidUntil: '',
    entryDate: '',
    portOfEntry: '',
    portOfEntryText: '',
    arrivingFrom: '',
    nextDestination: '',
  }
}

// A returning guest's earlier registration: its fields, and its number kept on the server.
export function fromPrevious(
  form: RegistrationForm,
  previous: CheckInPrepare['previous'],
): RegistrationForm {
  if (!previous) return form
  const pick = (value: string | null | undefined, fallback: string) => value ?? fallback
  return {
    ...form,
    title: pick(previous.title, form.title),
    dateOfBirth: pick(previous.dateOfBirth, ''),
    addressLine: pick(previous.addressLine, ''),
    addressCity: pick(previous.addressCity, ''),
    addressRegion: pick(previous.addressRegion, ''),
    addressCountry: pick(previous.addressCountry, form.addressCountry),
    purpose: previous.purpose ?? '',
    vehiclePlate: pick(previous.vehiclePlate, ''),
    occupation: pick(previous.occupation, ''),
    idType: previous.idType ?? form.idType,
    reuseFrom: previous.idNumberMasked ? previous.id : '',
    reusedMasked: previous.idNumberMasked ?? '',
    idCountry: pick(previous.idCountry, form.idCountry),
    idExpiry: pick(previous.idExpiry, ''),
  }
}

// The ID types a guest may show: national documents for Nigerians; a passport, or the ECOWAS card
// for ECOWAS citizens.
export function idTypesFor(nationality: string): IdType[] {
  if (!isForeign(nationality)) return [...NIGERIAN_ID_TYPES]
  return isEcowas(nationality) ? ['passport', 'ecowas_id'] : ['passport']
}

// What the rule set asks of this guest: all its lead rules for the lead guest; the foreign national
// rules for a foreign adult; Nigerian companions by name only.
export function requiredFor(rules: Rules, form: Pick<RegistrationForm, 'lead' | 'nationality'>) {
  const required = new Set<RegistrationField>(['name', 'nationality'])
  if (form.lead) for (const field of rules.lead.required) required.add(field)
  if (isForeign(form.nationality)) for (const field of rules.foreign.required) required.add(field)
  // Checked elsewhere: the guest profile's contact and the ID photo.
  required.delete('contact')
  required.delete('id_document')
  return required
}

export const foreignShown = (form: Pick<RegistrationForm, 'nationality'>) =>
  isForeign(form.nationality)

type Problems = Partial<Record<keyof RegistrationForm, string>>

const FIELD_KEYS: Partial<Record<RegistrationField, keyof RegistrationForm>> = {
  title: 'title',
  address: 'addressLine',
  id_type: 'idType',
  id_number: 'idNumber',
  date_of_birth: 'dateOfBirth',
  purpose: 'purpose',
  vehicle_plate: 'vehiclePlate',
  occupation: 'occupation',
  id_country: 'idCountry',
  id_expiry: 'idExpiry',
  visa_type: 'visaType',
  visa_number: 'visaNumber',
  visa_valid_until: 'visaValidUntil',
  entry_date: 'entryDate',
  port_of_entry: 'portOfEntry',
  arriving_from: 'arrivingFrom',
  next_destination: 'nextDestination',
}

// Every problem the form shows, keyed by field, in the order of the form.
export function problemsOf(form: RegistrationForm, rules: Rules): Problems {
  const problems: Problems = {}
  const required = requiredFor(rules, form)
  if (!form.firstName.trim()) problems.firstName = "Enter the guest's first name"
  if (!form.lastName.trim()) problems.lastName = "Enter the guest's last name"
  const notRequiredVisa = form.visaType === 'not_required'
  for (const field of required) {
    const key = FIELD_KEYS[field]
    if (!key) continue
    if (field === 'id_number' && form.reuseFrom && !form.idNumber) continue
    if ((field === 'visa_number' || field === 'visa_valid_until') && notRequiredVisa) continue
    if (field === 'address') {
      if (!form.addressLine.trim() || !form.addressCity.trim()) {
        problems.addressLine = MISSING_FIELD_MESSAGES.address
      }
      continue
    }
    if (!String(form[key]).trim()) problems[key] = MISSING_FIELD_MESSAGES[field]
  }
  if (form.idNumber.trim() && !problems.idNumber) {
    const problem = idNumberProblem(form.idType || undefined, form.idNumber)
    if (problem) problems.idNumber = problem
  }
  if (form.visaNumber.trim() && !notRequiredVisa && !problems.visaNumber) {
    const problem = idNumberProblem('passport', form.visaNumber)
    if (problem) problems.visaNumber = problem
  }
  if (form.visaType === 'other' && !form.visaTypeText.trim()) {
    problems.visaTypeText = 'Say which visa or permit'
  }
  return problems
}

const text = (value: string) => value.trim() || undefined

export function toInput(form: RegistrationForm): RegistrationInput {
  const foreign = isForeign(form.nationality)
  const notRequired = form.visaType === 'not_required'
  return {
    lead: form.lead,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    nationality: form.nationality,
    title: text(form.title),
    dateOfBirth: text(form.dateOfBirth),
    addressLine: text(form.addressLine),
    addressCity: text(form.addressCity),
    addressRegion: text(form.addressRegion),
    addressCountry: text(form.addressCountry),
    purpose: form.purpose || undefined,
    vehiclePlate: text(form.vehiclePlate),
    occupation: text(form.occupation),
    idType: form.idType || undefined,
    idNumber: text(form.idNumber),
    reuseFrom: form.idNumber.trim() ? undefined : form.reuseFrom || undefined,
    ...(foreign
      ? {
          idCountry: text(form.idCountry),
          idExpiry: text(form.idExpiry),
          visaType: form.visaType || undefined,
          visaTypeText: form.visaType === 'other' ? text(form.visaTypeText) : undefined,
          visaNumber: notRequired ? undefined : text(form.visaNumber),
          visaValidUntil: notRequired ? undefined : text(form.visaValidUntil),
          entryDate: text(form.entryDate),
          portOfEntry: form.portOfEntry || undefined,
          portOfEntryText: form.portOfEntry === 'other' ? text(form.portOfEntryText) : undefined,
          arrivingFrom: text(form.arrivingFrom),
          nextDestination: text(form.nextDestination),
        }
      : {}),
  }
}

export const warningsOf = (form: RegistrationForm, stay: { departure: string; today: string }) =>
  registrationWarnings(
    {
      idType: form.idType || undefined,
      idExpiry: form.idExpiry || undefined,
      visaType: form.visaType || undefined,
      visaValidUntil: form.visaValidUntil || undefined,
    },
    stay,
  )

// A nationality change: the foreign section opens, ECOWAS citizens get "Not required" preset, and
// the ID type moves to one the new nationality may show.
export function withNationality(form: RegistrationForm, nationality: string): RegistrationForm {
  const types = idTypesFor(nationality)
  const foreign = isForeign(nationality)
  return {
    ...form,
    nationality,
    idType: form.idType && types.includes(form.idType) ? form.idType : (types[0] ?? ''),
    idCountry: foreign ? form.idCountry || nationality : '',
    visaType:
      foreign && ECOWAS_NATIONS.includes(nationality)
        ? form.visaType || 'not_required'
        : form.visaType === 'not_required'
          ? ''
          : form.visaType,
    reuseFrom: '',
    reusedMasked: '',
  }
}

// "1 min 12 s"
export function deskTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m ? `${m} min ${s} s` : `${s} s`
}
