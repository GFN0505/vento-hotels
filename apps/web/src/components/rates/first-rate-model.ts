// "Your first rate" (design #19, OnbRate): one weekday price per room type and an optional Fri and
// Sat price ("same" when blank), checked with the shared price rule so messages match the API's.
import { ratePriceSchema } from '@vento/shared'

export type FirstRateRow = { weekday: string; weekend: string }
export type FirstRateRows = Record<string, FirstRateRow>
export type FirstRatePrice = { roomTypeId: string; weekday: string; weekend: string | null }

export function priceProblem(value: string, required: boolean): string | undefined {
  if (!value.trim()) return required ? 'Enter a weekday price' : undefined
  const result = ratePriceSchema.safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message
}

export const weekdayName = (id: string) => `weekday-${id}`
export const weekendName = (id: string) => `weekend-${id}`

// Every row's problems (keyed by input name, in screen order) and, when there are none, the prices.
export function checkFirstRate(
  typeIds: readonly string[],
  rows: FirstRateRows,
): { problems: Record<string, string | undefined>; order: string[]; prices?: FirstRatePrice[] } {
  const problems: Record<string, string | undefined> = {}
  const order: string[] = []
  const prices: FirstRatePrice[] = []
  for (const id of typeIds) {
    const row = rows[id] ?? { weekday: '', weekend: '' }
    order.push(weekdayName(id), weekendName(id))
    problems[weekdayName(id)] = priceProblem(row.weekday, true)
    problems[weekendName(id)] = priceProblem(row.weekend, false)
    const weekday = ratePriceSchema.safeParse(row.weekday)
    const weekend = row.weekend.trim() ? ratePriceSchema.safeParse(row.weekend) : null
    if (weekday.success && (weekend === null || weekend.success)) {
      prices.push({ roomTypeId: id, weekday: weekday.data, weekend: weekend?.data ?? null })
    }
  }
  const ok = Object.values(problems).every((p) => !p)
  return ok ? { problems, order, prices } : { problems, order }
}
