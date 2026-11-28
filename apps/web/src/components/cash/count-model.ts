// A count as typed: whole notes per row and an amount for smaller notes and coins, kept as text so
// an empty row means 0 and a half-typed number isn't lost. Totals come from the shared decimal
// helpers, the same ones the server stores.
import {
  countTotal,
  dec,
  EMPTY_COUNT,
  MAX_NOTES,
  NGN_NOTES,
  type NgnNote,
  NOTES_TOO_MANY,
  NOTES_WHOLE,
  type NoteCount,
  noteTotal,
  toAmount,
} from '@vento/shared'

export type CountDraft = Record<NgnNote | 'coins', string>

export const EMPTY_DRAFT: CountDraft = {
  '1000': '',
  '500': '',
  '200': '',
  '100': '',
  '50': '',
  coins: '',
}

export const COINS_PROBLEM = 'Smaller notes and coins go up to ₦99,999.00.'
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/

// Digits only, as people type them ("1,200" and spaces are fine).
const clean = (value: string) => value.replace(/[\s,]/g, '')

export function noteProblem(value: string): string | undefined {
  const typed = clean(value)
  if (typed === '') return undefined
  if (!/^\d+$/.test(typed)) return NOTES_WHOLE
  if (Number(typed) > MAX_NOTES) return NOTES_TOO_MANY
  return undefined
}

export function amountProblem(value: string, max?: string, message?: string): string | undefined {
  const typed = clean(value)
  if (typed === '') return undefined
  if (!AMOUNT.test(typed)) return 'Enter an amount with up to 2 decimal places'
  if (max && dec(typed).greaterThan(max)) return message ?? 'Check the amount.'
  return undefined
}

export const coinsProblem = (value: string) => amountProblem(value, '99999', COINS_PROBLEM)

// An amount as typed, or 0 when empty or not yet a number.
export function amountOf(value: string): string {
  const typed = clean(value)
  return AMOUNT.test(typed) ? toAmount(typed) : '0.00'
}

export function rowTotal(note: NgnNote, value: string): string {
  const typed = clean(value)
  return /^\d+$/.test(typed) && Number(typed) <= MAX_NOTES ? noteTotal(note, Number(typed)) : '0.00'
}

export function toCount(draft: CountDraft): NoteCount {
  const count: NoteCount = { ...EMPTY_COUNT }
  for (const note of NGN_NOTES) {
    const typed = clean(draft[note])
    count[note] = /^\d+$/.test(typed) ? Math.min(Number(typed), MAX_NOTES) : 0
  }
  count.coins = amountOf(draft.coins)
  return count
}

export const draftTotal = (draft: CountDraft) => countTotal(toCount(draft))

// The first problem in a draft, by field name, for focus on submit.
export function draftProblems(draft: CountDraft): Partial<Record<keyof CountDraft, string>> {
  const found: Partial<Record<keyof CountDraft, string>> = {}
  for (const note of NGN_NOTES) {
    const problem = noteProblem(draft[note])
    if (problem) found[note] = problem
  }
  const coins = coinsProblem(draft.coins)
  if (coins) found.coins = coins
  return found
}

export const isDraftEmpty = (draft: CountDraft) =>
  Object.values(draft).every((value) => clean(value) === '')
