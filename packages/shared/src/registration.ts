// Guest registration at check-in (spec: docs/specs/stage-1-front-desk-check-in.md, "Registration
// step"): the ID types, visa types and ports of entry the form offers, the field catalogue the
// registration rule set refers to, the ECOWAS list, ID number shapes, masking and the expiry
// warnings. Which fields are required is configuration (registration_rules, To verify), never here.
import { z } from 'zod'
import { calendarDateSchema } from './dates.ts'
import { idSchema } from './ids.ts'
import { formatRateDate } from './rates.ts'

export const ID_TYPES = ['nin', 'passport', 'drivers_licence', 'voters_card', 'ecowas_id'] as const
export type IdType = (typeof ID_TYPES)[number]
export const idTypeSchema = z.enum(ID_TYPES)
export const ID_TYPE_LABELS: Record<IdType, string> = {
  nin: 'NIN',
  passport: 'Passport',
  drivers_licence: "Driver's licence",
  voters_card: "Voter's card",
  ecowas_id: 'ECOWAS national ID card',
}
// What each nationality may show: Nigerians their national documents or a passport; foreign
// nationals a passport, or the ECOWAS card for ECOWAS citizens.
export const NIGERIAN_ID_TYPES: readonly IdType[] = [
  'nin',
  'passport',
  'drivers_licence',
  'voters_card',
]

export const VISA_TYPES = [
  'visa_on_arrival',
  'business',
  'tourist',
  'transit',
  'residence_permit',
  'other',
  'not_required',
] as const
export type VisaType = (typeof VISA_TYPES)[number]
export const visaTypeSchema = z.enum(VISA_TYPES)
export const VISA_TYPE_LABELS: Record<VisaType, string> = {
  visa_on_arrival: 'Visa on arrival',
  business: 'Business visa',
  tourist: 'Tourist visa',
  transit: 'Transit visa',
  residence_permit: 'Residence permit (CERPAC)',
  other: 'Other',
  not_required: 'Not required · ECOWAS citizen',
}

export const PORTS_OF_ENTRY = [
  'lagos_mmia',
  'abuja_naia',
  'port_harcourt_phia',
  'kano_makia',
  'enugu',
  'seme',
  'other',
] as const
export type PortOfEntry = (typeof PORTS_OF_ENTRY)[number]
export const portOfEntrySchema = z.enum(PORTS_OF_ENTRY)
export const PORT_OF_ENTRY_LABELS: Record<PortOfEntry, string> = {
  lagos_mmia: 'Lagos MMIA',
  abuja_naia: 'Abuja NAIA',
  port_harcourt_phia: 'Port Harcourt PHIA',
  kano_makia: 'Kano MAKIA',
  enugu: 'Enugu (Akanu Ibiam)',
  seme: 'Seme border',
  other: 'Other',
}

export const VISIT_PURPOSES = ['business', 'leisure', 'other'] as const
export type VisitPurpose = (typeof VISIT_PURPOSES)[number]
export const visitPurposeSchema = z.enum(VISIT_PURPOSES)
export const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  business: 'Business',
  leisure: 'Leisure',
  other: 'Other',
}

// ECOWAS member states, as data with its source (To verify with the lawyer, spec question 1):
// Burkina Faso, Mali and Niger left in January 2025.
export const ECOWAS_SOURCE = 'ECOWAS Commission member list, as of January 2025 (To verify)'
export const ECOWAS_NATIONS: readonly string[] = [
  'BJ',
  'CV',
  'CI',
  'GM',
  'GH',
  'GN',
  'GW',
  'LR',
  'NG',
  'SN',
  'SL',
  'TG',
]
export const isEcowas = (nationality: string) => ECOWAS_NATIONS.includes(nationality)
export const isForeign = (nationality: string) => nationality !== 'NG'

// The fields a registration rule can name. `contact` is the guest profile's phone or email,
// `address` the home address (line, city and country), `id_document` the ID photo or scan.
export const REGISTRATION_FIELDS = [
  'title',
  'name',
  'nationality',
  'contact',
  'address',
  'id_type',
  'id_number',
  'id_document',
  'date_of_birth',
  'purpose',
  'vehicle_plate',
  'occupation',
  'id_country',
  'id_expiry',
  'visa_type',
  'visa_number',
  'visa_valid_until',
  'entry_date',
  'port_of_entry',
  'arriving_from',
  'next_destination',
] as const
export type RegistrationField = (typeof REGISTRATION_FIELDS)[number]
export const registrationFieldSchema = z.enum(REGISTRATION_FIELDS)

export const REGISTRATION_FIELD_LABELS: Record<RegistrationField, string> = {
  title: 'Title',
  name: 'Name',
  nationality: 'Nationality',
  contact: 'Phone or email',
  address: 'Home address',
  id_type: 'ID type',
  id_number: 'ID number',
  id_document: 'ID photo',
  date_of_birth: 'Date of birth',
  purpose: 'Purpose of visit',
  vehicle_plate: 'Vehicle plate',
  occupation: 'Occupation',
  id_country: 'Issuing country',
  id_expiry: 'Passport expiry',
  visa_type: 'Visa or permit',
  visa_number: 'Visa or permit number',
  visa_valid_until: 'Valid until',
  entry_date: 'Date of entry to Nigeria',
  port_of_entry: 'Port of entry',
  arriving_from: 'Arriving from',
  next_destination: 'Next destination',
}

// The first problem the form shows for a missing required field.
export const MISSING_FIELD_MESSAGES: Record<RegistrationField, string> = {
  title: 'Pick a title',
  name: "Enter the guest's name",
  nationality: 'Choose a nationality',
  contact: 'Enter a phone number or an email',
  address: "Enter the guest's home address",
  id_type: 'Pick the ID type',
  id_number: "Enter the guest's ID number",
  id_document: 'Take a photo of the ID, or upload a scan',
  date_of_birth: 'Enter the date of birth',
  purpose: 'Pick the purpose of the visit',
  vehicle_plate: 'Enter the vehicle plate',
  occupation: "Enter the guest's occupation",
  id_country: 'Choose the issuing country',
  id_expiry: 'Enter the passport expiry',
  visa_type: 'Pick the visa or permit',
  visa_number: 'Enter the visa or permit number',
  visa_valid_until: 'Enter when the visa or permit ends',
  entry_date: 'Enter the date of entry to Nigeria',
  port_of_entry: 'Pick the port of entry',
  arriving_from: 'Enter where the guest is arriving from',
  next_destination: 'Enter the next destination',
}

// Who a rule applies to: every registered guest, foreign nationals, or ECOWAS nationals.
export const RULE_AUDIENCES = ['all', 'foreign', 'ecowas'] as const
export type RuleAudience = (typeof RULE_AUDIENCES)[number]

export const ruleSetSchema = z.object({
  // A short hash of the rules in force, stored on each registration.
  version: z.string(),
  rules: z.array(
    z.object({
      audience: z.enum(RULE_AUDIENCES),
      field: registrationFieldSchema,
      required: z.boolean(),
      source: z.string(),
      verified: z.boolean(),
    }),
  ),
})
export type RuleSet = z.infer<typeof ruleSetSchema>

// The required fields for one guest under a rule set: lead guests take every audience that applies;
// other adults only the foreign national rules (Nigerian companions are registered by name).
export function requiredFields(
  set: Pick<RuleSet, 'rules'>,
  guest: { nationality: string; lead: boolean },
): RegistrationField[] {
  const foreign = isForeign(guest.nationality)
  const ecowas = isEcowas(guest.nationality)
  const applies = (audience: RuleAudience) =>
    audience === 'all' ? guest.lead : audience === 'foreign' ? foreign : foreign && ecowas
  const required = new Set<RegistrationField>(['name', 'nationality'])
  for (const rule of set.rules) {
    if (applies(rule.audience) && rule.required) required.add(rule.field)
  }
  // An ECOWAS citizen needs no visa: the "Not required" option stands for the visa fields.
  return [...required]
}

// --- ID numbers ---------------------------------------------------------------------------------

export const ID_NUMBER_MESSAGE = 'Use 4 to 20 letters, digits or hyphens.'
export const NIN_MESSAGE = 'A NIN has 11 digits.'

export const normalizeIdNumber = (value: string) => value.trim().replace(/\s+/g, '').toUpperCase()

export function idNumberProblem(type: IdType | undefined, value: string): string | null {
  const number = normalizeIdNumber(value)
  if (type === 'nin') return /^\d{11}$/.test(number) ? null : NIN_MESSAGE
  return /^[A-Z0-9-]{4,20}$/.test(number) ? null : ID_NUMBER_MESSAGE
}

const BULLET = '•'

// Masked for display: passports and visas keep their first two and last two characters
// ("A0•••••12"); national numbers their last four ("••••••6612").
export function maskIdNumber(type: IdType | 'visa', value: string): string {
  const number = normalizeIdNumber(value)
  if (type === 'passport' || type === 'ecowas_id') {
    if (number.length <= 4) return BULLET.repeat(number.length)
    return `${number.slice(0, 2)}${BULLET.repeat(Math.max(3, number.length - 4))}${number.slice(-2)}`
  }
  if (number.length <= 4) return BULLET.repeat(number.length)
  return `${BULLET.repeat(6)}${number.slice(-4)}`
}

// "NIN ••••••6612", "Passport G0••••12"
export const idLine = (type: IdType, masked: string) => `${ID_TYPE_LABELS[type]} ${masked}`

// --- What a registration holds ------------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer`)
    .optional()
    .transform((value) => value || undefined)

export const registrationInputSchema = z.object({
  lead: z.boolean(),
  // For other adults in the room; the lead guest is the stay's guest.
  firstName: text(60).min(1, "Enter the guest's first name"),
  lastName: text(60).min(1, "Enter the guest's last name"),
  title: optionalText(20),
  nationality: z.string().regex(/^[A-Z]{2}$/, 'Choose a nationality'),
  dateOfBirth: calendarDateSchema.optional(),
  addressLine: optionalText(200),
  addressCity: optionalText(80),
  addressRegion: optionalText(80),
  addressCountry: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  purpose: visitPurposeSchema.optional(),
  vehiclePlate: optionalText(20),
  occupation: optionalText(80),
  idType: idTypeSchema.optional(),
  // As typed. Left out with `reuseFrom` set, the earlier registration's number is copied on the
  // server (the full number never goes to the device).
  idNumber: optionalText(30),
  reuseFrom: idSchema.optional(),
  idCountry: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  idExpiry: calendarDateSchema.optional(),
  visaType: visaTypeSchema.optional(),
  visaTypeText: optionalText(60),
  visaNumber: optionalText(30),
  visaValidUntil: calendarDateSchema.optional(),
  entryDate: calendarDateSchema.optional(),
  portOfEntry: portOfEntrySchema.optional(),
  portOfEntryText: optionalText(60),
  arrivingFrom: optionalText(80),
  nextDestination: optionalText(80),
})
export type RegistrationInput = z.input<typeof registrationInputSchema>
export type RegistrationValues = z.output<typeof registrationInputSchema>

// A registration as every response shows it: numbers masked.
export const registrationViewSchema = z.object({
  id: idSchema,
  lead: z.boolean(),
  cardNumber: z.string().nullable(),
  guestId: idSchema.nullable(),
  title: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  nationality: z.string(),
  dateOfBirth: calendarDateSchema.nullable(),
  addressLine: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressRegion: z.string().nullable(),
  addressCountry: z.string().nullable(),
  purpose: visitPurposeSchema.nullable(),
  vehiclePlate: z.string().nullable(),
  occupation: z.string().nullable(),
  idType: idTypeSchema.nullable(),
  idNumberMasked: z.string().nullable(),
  idCountry: z.string().nullable(),
  idExpiry: calendarDateSchema.nullable(),
  visaType: visaTypeSchema.nullable(),
  visaTypeText: z.string().nullable(),
  visaNumberMasked: z.string().nullable(),
  visaValidUntil: calendarDateSchema.nullable(),
  entryDate: calendarDateSchema.nullable(),
  portOfEntry: portOfEntrySchema.nullable(),
  portOfEntryText: z.string().nullable(),
  arrivingFrom: z.string().nullable(),
  nextDestination: z.string().nullable(),
  // The ID photo or scan, if one is on file (never the file itself).
  idDocument: z
    .object({ id: idSchema, contentType: z.string(), capturedAt: z.iso.datetime() })
    .nullable(),
  businessDate: calendarDateSchema,
  byName: z.string(),
  createdAt: z.iso.datetime(),
})
export type RegistrationView = z.infer<typeof registrationViewSchema>

// Which required fields a registration leaves empty. `hasIdNumber` and `hasDocument` say whether
// the number or the photo comes from elsewhere (reused, or uploaded separately).
export function missingFields(
  values: Partial<RegistrationValues>,
  required: readonly RegistrationField[],
  extra: { hasContact: boolean; hasIdNumber?: boolean; hasDocument?: boolean },
): RegistrationField[] {
  const notRequiredVisa = values.visaType === 'not_required'
  const present: Record<RegistrationField, boolean> = {
    title: Boolean(values.title),
    name: Boolean(values.firstName && values.lastName),
    nationality: Boolean(values.nationality),
    contact: extra.hasContact,
    address: Boolean(values.addressLine && values.addressCity && values.addressCountry),
    id_type: Boolean(values.idType),
    id_number: Boolean(values.idNumber) || Boolean(extra.hasIdNumber),
    id_document: Boolean(extra.hasDocument),
    date_of_birth: Boolean(values.dateOfBirth),
    purpose: Boolean(values.purpose),
    vehicle_plate: Boolean(values.vehiclePlate),
    occupation: Boolean(values.occupation),
    id_country: Boolean(values.idCountry),
    id_expiry: Boolean(values.idExpiry),
    visa_type: Boolean(values.visaType),
    visa_number: notRequiredVisa || Boolean(values.visaNumber),
    visa_valid_until: notRequiredVisa || Boolean(values.visaValidUntil),
    entry_date: Boolean(values.entryDate),
    port_of_entry: Boolean(values.portOfEntry),
    arriving_from: Boolean(values.arrivingFrom),
    next_destination: Boolean(values.nextDestination),
  }
  return required.filter((field) => !present[field])
}

// Warnings, never blocks: the hotel records, it doesn't enforce immigration law.
export function registrationWarnings(
  values: Pick<Partial<RegistrationValues>, 'idType' | 'idExpiry' | 'visaType' | 'visaValidUntil'>,
  stay: { departure: string; today: string },
): string[] {
  const warnings: string[] = []
  const departure = formatRateDate(stay.departure, false)
  if (values.idExpiry && values.idExpiry < stay.today) {
    warnings.push(
      `Passport expired ${formatRateDate(values.idExpiry)}. Check the guest's travel document.`,
    )
  } else if (values.idExpiry && values.idExpiry < stay.departure) {
    warnings.push(
      `Passport ends ${formatRateDate(values.idExpiry)}, before departure on ${departure}.`,
    )
  }
  if (
    values.visaType &&
    values.visaType !== 'not_required' &&
    values.visaValidUntil &&
    values.visaValidUntil < stay.departure
  ) {
    warnings.push(
      `Visa ends ${formatRateDate(values.visaValidUntil)}, before departure on ${departure}.`,
    )
  }
  return warnings
}

// --- ID photos and scans ------------------------------------------------------------------------

export const ID_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024
// Photos are downscaled on the device to this long side and re-encoded as JPEG (no metadata).
export const ID_PHOTO_MAX_SIDE = 1600
export const ID_DOCUMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number]
export const ID_DOCUMENT_TOO_LARGE =
  'That file is over 5 MB. Take a photo instead, or scan at a lower resolution.'
export const ID_DOCUMENT_WRONG_FILE =
  "That isn't a photo or a PDF. Take a photo of the ID, or upload a scan."
// A viewed ID image's link works this long.
export const ID_DOCUMENT_LINK_SECONDS = 60
// A revealed number shows this long.
export const REVEAL_SECONDS = 30
