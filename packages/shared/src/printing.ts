// The data each printed document is built from (printing skill): the builders take one of these and
// never query. Stage 1: the registration card (#21). Every ID number here is already masked.
import { z } from 'zod'
import { calendarDateSchema } from './dates.ts'

const line = z.object({ label: z.string(), value: z.string() })

export const registrationCardDataSchema = z.object({
  hotel: z.object({
    name: z.string(),
    // The owning company's legal name, RC number and TIN.
    company: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  cardNumber: z.string(),
  bookingNumber: z.string(),
  // 1 for the first print; later prints say "REPRINT · copy 2".
  copy: z.number().int().min(1),
  guest: z.array(line),
  stay: z.array(line),
  // Only for a non-Nigerian lead guest.
  foreign: z.array(line).nullable(),
  // Other guests in the room, by name.
  companions: z.array(z.string()),
  terms: z.array(z.string()),
  checkedInBy: z.string(),
  businessDate: calendarDateSchema,
  printedLine: z.string(),
})
export type RegistrationCardData = z.infer<typeof registrationCardDataSchema>

// Stage 1 terms are fixed defaults (no editor; spec "Registration card").
export function registrationCardTerms(checkOutTime: string): string[] {
  return [
    `Check-out is ${checkOutTime}. Late check-out is subject to availability and may be charged.`,
    'The hotel is not responsible for valuables left outside the in-room safe.',
    'Your personal data is processed under the Nigeria Data Protection Act 2023 for registration, legal reporting and billing. Identity numbers are stored securely and shown only to authorised staff.',
  ]
}

// "RC-VI-26-000147": per hotel per year, gaps allowed (not a financial document).
export const registrationCardNumber = (prefix: string, year: string, sequence: number) =>
  `RC-${prefix}-${year.slice(-2)}-${String(sequence).padStart(6, '0')}`
