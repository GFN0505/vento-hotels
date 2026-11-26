// The rate calendar (the Rates tab of #8): nights from a date, rows grouped by room type, one row
// per active plan selling it, each cell priced through the shared maths. Derived rows are computed
// from their parent, never stored, and follow its restrictions.
import type { CalendarDate, RateCalendar } from '@vento/shared'
import { addDays, isWeekendNight, lastRateDate, nightOf } from '@vento/shared'
import type { Database } from '../db/client.ts'
import { type Access, can } from '../tenancy/access.ts'
import { isLive, loadRatesProperty, requireRatesRead } from './context.ts'
import { roomTypeNotFound, tooFarAhead } from './errors.ts'
import { loadRoomTypes } from './guards.ts'
import { loadPricing, sourceFor } from './pricing-data.ts'

// Runs of consecutive dates carrying the same season name on any own-price row shown.
export function seasonBands(
  dates: readonly CalendarDate[],
  namesByDate: ReadonlyMap<CalendarDate, ReadonlySet<string>>,
): { name: string; from: CalendarDate; to: CalendarDate }[] {
  const bands: { name: string; from: CalendarDate; to: CalendarDate }[] = []
  const open = new Map<string, { name: string; from: CalendarDate; to: CalendarDate }>()
  for (const date of dates) {
    const names = namesByDate.get(date) ?? new Set<string>()
    for (const [name, band] of open) {
      if (!names.has(name)) {
        bands.push(band)
        open.delete(name)
      }
    }
    for (const name of names) {
      const band = open.get(name)
      if (band) band.to = date
      else open.set(name, { name, from: date, to: date })
    }
  }
  bands.push(...open.values())
  return bands.sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name))
}

export async function rateCalendar(
  db: Database,
  access: Access,
  input: {
    propertyId: string
    from?: string | undefined
    nights: number
    roomTypeId?: string | undefined
    includeCorporate: boolean
  },
): Promise<RateCalendar> {
  requireRatesRead(access)
  const property = await loadRatesProperty(db, access, input.propertyId)
  const last = lastRateDate(property.businessDate)
  const from = input.from ?? property.businessDate
  if (from > last) throw tooFarAhead(last)
  const dates = Array.from({ length: input.nights }, (_, i) => addDays(from, i))
  const to = dates.at(-1) ?? from
  const scope = { organizationId: access.organizationId, propertyId: property.id }
  const [pricing, allTypes] = await Promise.all([
    loadPricing(db, scope, { from, to }),
    loadRoomTypes(db, scope),
  ])
  const types = input.roomTypeId
    ? allTypes.filter((type) => type.id === input.roomTypeId)
    : allTypes
  if (input.roomTypeId && types.length === 0) throw roomTypeNotFound()
  const plans = pricing.plans.filter(
    (plan) => input.includeCorporate || plan.bookableBy === 'anyone',
  )

  const seasonNames = new Map<CalendarDate, Set<string>>()
  const roomTypes = types.map((type) => ({
    id: type.id,
    name: type.name,
    code: type.code,
    rows: plans.flatMap((plan) => {
      const source = sourceFor(plan, type.id, pricing)
      if (!source) return []
      const parent = plan.parentId ? pricing.byId.get(plan.parentId) : undefined
      return [
        {
          ratePlanId: plan.id,
          name: plan.name,
          code: plan.code,
          pricing: plan.pricing,
          parent: parent ? { id: parent.id, name: parent.name } : null,
          bookableBy: plan.bookableBy,
          pricesIncludeTaxes: plan.pricesIncludeTaxes,
          cells: dates.map((date) => {
            const night = nightOf(source, plan.adjustment, plan.minStay, date)
            const cell = source.dates.get(date)
            if (plan.pricing === 'own' && cell?.seasonName) {
              const names = seasonNames.get(date) ?? new Set<string>()
              names.add(cell.seasonName)
              seasonNames.set(date, names)
            }
            return {
              date,
              price: night.price,
              from: night.from,
              closed: night.closed,
              closedToArrival: night.closedToArrival,
              minStay: night.minStay,
              datePrice: cell?.price ?? null,
              dateMinStay: cell?.minStay ?? null,
              seasonName: cell?.seasonName ?? null,
            }
          }),
        },
      ]
    }),
  }))

  return {
    propertyId: property.id,
    propertyName: property.name,
    businessDate: property.businessDate,
    lastRateDate: last,
    live: isLive(property),
    canEdit: can(access, 'rates.edit'),
    dates: dates.map((date) => ({
      date,
      weekend: isWeekendNight(date),
      past: date < property.businessDate,
    })),
    seasons: seasonBands(dates, seasonNames),
    roomTypes,
  }
}
