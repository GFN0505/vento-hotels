// "Change dates" (design #8's Bulk edit; spec: Rates): a plan with its own prices, room types, a
// range and days of the week, then new prices or back to standard, a season name and the three
// restrictions, each "Keep as they are" unless chosen. Checked with the shared schema.
import {
  type CalendarDate,
  formatRateDate,
  noDatesMessage,
  ratePriceSchema,
  selectDates,
  setRateDatesSchema,
  type Weekday,
} from '@vento/shared'

export type Tri = 'keep' | 'on' | 'off'

export type DatesForm = {
  planId: string
  roomTypeIds: string[]
  from: CalendarDate
  to: CalendarDate
  days: Weekday[]
  priceMode: 'keep' | 'set' | 'standard'
  prices: Record<string, string>
  season: string
  minStay: Tri
  minStayNights: string
  closedToArrival: Tri
  closed: Tri
}

export type DatesProblems = Record<string, string | undefined>

const tri = (value: Tri) => (value === 'keep' ? undefined : value === 'on')

export function toInput(form: DatesForm) {
  return {
    ratePlanId: form.planId,
    roomTypeIds: form.roomTypeIds,
    from: form.from,
    to: form.to,
    days: form.days,
    ...(form.priceMode === 'set'
      ? {
          prices: form.roomTypeIds.map((id) => ({
            roomTypeId: id,
            price: form.prices[id]?.trim() ?? '',
          })),
        }
      : {}),
    ...(form.priceMode === 'standard' ? { backToStandard: true } : {}),
    ...(form.season.trim() ? { seasonName: form.season.trim() } : {}),
    ...(form.minStay === 'keep'
      ? {}
      : {
          minStay: form.minStay === 'on' ? Number(form.minStayNights.trim() || Number.NaN) : null,
        }),
    ...(tri(form.closedToArrival) === undefined
      ? {}
      : { closedToArrival: tri(form.closedToArrival) }),
    ...(tri(form.closed) === undefined ? {} : { closed: tri(form.closed) }),
  }
}

// Nights the apply would change: in range, on the chosen days, not before the business date.
export function datesIn(form: DatesForm, businessDate: CalendarDate): CalendarDate[] {
  if (!form.from || !form.to || form.to < form.from) return []
  return selectDates(form.from, form.to, form.days).filter((d) => d >= businessDate)
}

export function nothingChosen(form: DatesForm): boolean {
  return (
    form.priceMode === 'keep' &&
    !form.season.trim() &&
    form.minStay === 'keep' &&
    form.closedToArrival === 'keep' &&
    form.closed === 'keep'
  )
}

// A placeholder batch id for checking; the real one is made when applying.
const CHECK_ID = '01934b6e-0000-7000-8000-000000000000'

export function check(
  form: DatesForm,
  limits: { businessDate: CalendarDate; lastRateDate: CalendarDate },
): DatesProblems {
  const problems: DatesProblems = {}
  if (form.from && form.from < limits.businessDate) {
    problems.from = `${formatRateDate(form.from)} is before the business date. Past rates can't change.`
  }
  if (form.to && form.to > limits.lastRateDate) {
    problems.to = `Rates can be set up to ${formatRateDate(limits.lastRateDate)}.`
  }
  if (form.priceMode === 'set') {
    for (const id of form.roomTypeIds) {
      const result = ratePriceSchema.safeParse(form.prices[id] ?? '')
      if (!result.success)
        problems[`price-${id}`] = (form.prices[id] ?? '').trim()
          ? result.error.issues[0]?.message
          : 'Enter a price'
    }
  }
  if (form.minStay === 'on' && !/^\d{1,2}$/.test(form.minStayNights.trim())) {
    problems.minStayNights = 'Enter 1 to 30 nights'
  }
  const result = setRateDatesSchema.safeParse({ ...toInput(form), batchId: CHECK_ID })
  if (!result.success) {
    for (const issue of result.error.issues) {
      const [head, index] = issue.path.map(String)
      const field =
        head === 'prices'
          ? `price-${form.roomTypeIds[Number(index)]}`
          : head === 'minStay'
            ? 'minStayNights'
            : head === 'seasonName'
              ? 'season'
              : (head ?? 'form')
      problems[field] ??= issue.message
    }
  }
  if (
    !problems.to &&
    !problems.from &&
    !problems.days &&
    form.from &&
    form.to &&
    form.to >= form.from
  ) {
    if (datesIn(form, limits.businessDate).length === 0) {
      problems.days = noDatesMessage(form.from, form.to, form.days)
    }
  }
  return problems
}

export const hasProblems = (problems: DatesProblems) => Object.values(problems).some(Boolean)
