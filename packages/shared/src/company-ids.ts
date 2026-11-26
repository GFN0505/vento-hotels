// RC numbers and TINs for the group's own companies (spec: stage-1-hotels-and-companies.md).
// Validation stays loose until the formats are confirmed (spec open question 6): a CAC prefix and
// up to 8 digits, and a TIN of 8 to 14 digits with an optional hyphen.
import { z } from 'zod'

export const CAC_PREFIXES = ['RC', 'BN', 'IT', 'LP', 'LLP'] as const

// "rc1184402", "RC-1184402" and "1184402" all become "RC 1184402"; bare digits are read as RC.
export function normalizeRcNumber(input: string): string | null {
  const match = /^(RC|BN|IT|LLP|LP)?[\s.-]*(\d{1,8})$/i.exec(input.trim())
  if (!match) return null
  const prefix = (match[1] ?? 'RC').toUpperCase()
  return `${prefix} ${match[2]}`
}

// Spaces are dropped; one hyphen may separate the parts, as in 21847390-0001.
export function normalizeTin(input: string): string | null {
  const compact = input.replace(/\s+/g, '')
  if (!/^\d+(-\d+)?$/.test(compact)) return null
  const digits = compact.replace('-', '').length
  return digits >= 8 && digits <= 14 ? compact : null
}

// Two TINs are the same number whether or not the hyphen was typed.
export function tinDigits(tin: string): string {
  return tin.replace(/\D/g, '')
}

export const rcNumberSchema = z
  .string()
  .trim()
  .max(20)
  .transform((value, ctx) => {
    const normalized = normalizeRcNumber(value)
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Use a CAC number like RC 1184402 or BN 3456789' })
      return z.NEVER
    }
    return normalized
  })

export const tinSchema = z
  .string()
  .trim()
  .max(20)
  .transform((value, ctx) => {
    const normalized = normalizeTin(value)
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Use 8 to 14 digits, like 21847390-0001' })
      return z.NEVER
    }
    return normalized
  })
