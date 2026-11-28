// What other pages read from rates: the Rooms page's Base rate column and Home's "Set rates"
// checklist step (spec, "Rooms page and Home").
import { toAmount } from '@vento/shared'
import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { ratePlanRoomTypes } from '../db/schema/rates.ts'
import type { Reader } from './context.ts'
import { basePlanOf } from './plan-reads.ts'

export type BaseRate = {
  ratePlanId: string
  ratePlanName: string
  amount: string | null
  pricesIncludeTaxes: boolean
}

// Per room type: the weekday standard price on the hotel's base plan (null amount = "Not priced").
// Null when the hotel has no base plan yet.
export async function baseRates(
  db: Reader,
  organizationId: string,
  propertyId: string,
): Promise<{ forType: (roomTypeId: string) => BaseRate | null }> {
  const plan = await basePlanOf(db, organizationId, propertyId)
  if (!plan) return { forType: () => null }
  const rows = await db
    .select({ roomTypeId: ratePlanRoomTypes.roomTypeId, weekday: ratePlanRoomTypes.weekdayPrice })
    .from(ratePlanRoomTypes)
    .where(and(eq(ratePlanRoomTypes.ratePlanId, plan.id)))
  const prices = new Map(rows.map((row) => [row.roomTypeId, row.weekday]))
  return {
    forType: (roomTypeId) => {
      const weekday = prices.get(roomTypeId)
      return {
        ratePlanId: plan.id,
        ratePlanName: plan.name,
        pricesIncludeTaxes: plan.pricesIncludeTaxes,
        amount: weekday ? toAmount(weekday) : null,
      }
    },
  }
}

// Hotels (of those given) with an active own-price plan selling every active room type.
export async function hotelsWithRates(
  db: Pick<Database, 'execute'>,
  organizationId: string,
  propertyIds: readonly string[],
): Promise<Set<string>> {
  if (propertyIds.length === 0) return new Set()
  const rows = await db.execute<{ property_id: string }>(sql`
    select p.property_id
    from rate_plans p
    where p.organization_id = ${organizationId}
      and ${inList(propertyIds)}
      and p.archived_at is null
      and p.pricing = 'own'
      and not exists (
        select 1 from room_types rt
        where rt.property_id = p.property_id
          and rt.archived_at is null
          and not exists (
            select 1 from rate_plan_room_types x
            where x.rate_plan_id = p.id and x.room_type_id = rt.id
          )
      )
    group by p.property_id`)
  return new Set(rows.rows.map((row) => row.property_id))
}

const inList = (ids: readonly string[]): SQL =>
  sql`p.property_id in (${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`
