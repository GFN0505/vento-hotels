// The minimal group-wide guest (spec: stage-1-availability-and-reservations.md, "Guest step"): title,
// names, phone (E.164) or email, nationality. One record across the group; ID, address and the
// foreign national details are taken at check-in (brick 8); merging duplicates is Stage 4.
import { z } from 'zod'

export const GUEST_TITLES = [
  'Mr',
  'Mrs',
  'Ms',
  'Miss',
  'Dr',
  'Prof',
  'Chief',
  'Alhaji',
  'Alhaja',
  'Engr',
  'Barr',
] as const

export const PHONE_MESSAGE =
  'Enter the phone number with its country code, e.g. +44 7700 900123, or a Nigerian number starting 0.'
export const CONTACT_MESSAGE = 'Enter a phone number or an email, so the hotel can reach the guest.'

// Calling codes of one or two digits; everything else is three (ITU E.164 assignments).
const ONE = new Set(['1', '7'])
const TWO = new Set([
  '20',
  '27',
  '30',
  '31',
  '32',
  '33',
  '34',
  '36',
  '39',
  '40',
  '41',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '49',
  '51',
  '52',
  '53',
  '54',
  '55',
  '56',
  '57',
  '58',
  '60',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '81',
  '82',
  '84',
  '86',
  '90',
  '91',
  '92',
  '93',
  '94',
  '95',
  '98',
])

function callingCode(digits: string): string {
  if (ONE.has(digits.slice(0, 1))) return digits.slice(0, 1)
  if (TWO.has(digits.slice(0, 2))) return digits.slice(0, 2)
  return digits.slice(0, 3)
}

// A phone as typed → E.164, or null when it can't be one. "0803 456 4567" → "+2348034564567";
// "+44 7700 900123" → "+447700900123". No country library: a Nigerian number starting 0 is the
// one local form accepted, everything else needs its country code.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  const plus = trimmed.startsWith('+') || trimmed.startsWith('00')
  const digits = trimmed.replace(/\D/g, '')
  if (!plus && /^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`
  if (!plus && /^234[789]\d{9}$/.test(digits)) return `+${digits}`
  if (!plus) return null
  const international = trimmed.startsWith('00') ? digits.slice(2) : digits
  if (!/^[1-9]\d{7,14}$/.test(international)) return null
  return `+${international}`
}

function split(e164: string): { code: string; national: string } {
  const digits = e164.replace(/\D/g, '')
  const code = callingCode(digits)
  return { code, national: digits.slice(code.length) }
}

// "+234 803 456 4567", "+44 7700 900123".
export function formatPhone(e164: string): string {
  const { code, national } = split(e164)
  if (code === '234' && national.length === 10) {
    return `+234 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`
  }
  return `+${code} ${national.slice(0, 4)} ${national.slice(4)}`.trim()
}

// "+234 803 ••• 4567": enough to tell two guests apart in a list, not enough to read out.
export function maskPhone(e164: string): string {
  const { code, national } = split(e164)
  return `+${code} ${national.slice(0, 3)} ••• ${national.slice(-4)}`
}

const nameField = (label: string) =>
  z.string().trim().min(1, `Enter the ${label}`).max(60, 'Use 60 characters or fewer')

const phoneField = z
  .string()
  .trim()
  .max(30)
  .transform((value, ctx) => {
    if (value === '') return undefined
    const phone = normalizePhone(value)
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: PHONE_MESSAGE })
      return z.NEVER
    }
    return phone
  })

const emailField = z
  .string()
  .trim()
  .max(254)
  .transform((value) => (value === '' ? undefined : value))
  .pipe(z.email('Enter an email like name@example.com').toLowerCase().optional())

const titleField = z
  .string()
  .trim()
  .max(20, 'Use 20 characters or fewer')
  .transform((value) => (value === '' ? undefined : value))

export const nationalitySchema = z.string().regex(/^[A-Z]{2}$/, 'Choose a nationality')

const guestShape = {
  title: titleField.optional(),
  firstName: nameField('first name'),
  lastName: nameField('last name'),
  phone: phoneField.optional(),
  email: emailField.optional(),
  nationality: nationalitySchema.default('NG'),
}

const hasContact = (guest: { phone?: string | undefined; email?: string | undefined }) =>
  Boolean(guest.phone || guest.email)

export const guestFieldsSchema = z
  .object(guestShape)
  .refine(hasContact, { message: CONTACT_MESSAGE, path: ['phone'] })
export type GuestFields = z.infer<typeof guestFieldsSchema>
export type GuestFieldsInput = z.input<typeof guestFieldsSchema>

export const guestSearchInputSchema = z.object({
  q: z.string().trim().min(3, 'Type at least 3 characters').max(120),
})

export const guestMatchSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  // E.164, shown masked in the list and in full once picked (the agent confirms it with the guest).
  phone: z.string().nullable(),
  maskedPhone: z.string().nullable(),
  email: z.string().nullable(),
  nationality: z.string(),
})
export type GuestMatch = z.infer<typeof guestMatchSchema>

export function guestName(guest: { firstName: string; lastName: string }): string {
  return `${guest.firstName} ${guest.lastName}`
}
