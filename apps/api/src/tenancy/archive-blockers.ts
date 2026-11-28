// What stops a hotel being archived. Each later brick adds its check here, inside the archive
// transaction (spec: stage-1-hotels-and-companies.md, "Archive a hotel"):
// - brick 4: upcoming reservations that aren't cancelled (in-house guests come with check-in, brick 8);
// - bricks 9–10: folios with a balance, open cashier shifts;
// - Stage 3: open POS checks.
import { and, count, eq, gt, inArray, ne } from 'drizzle-orm'
import { cashierShifts } from '../db/schema/cash.ts'
import { reservations } from '../db/schema/reservations.ts'
import type { Reader } from './property-views.ts'

export type ArchiveBlocker = {
  code: string
  count: number
  // One line for the dialog, e.g. "12 upcoming reservations".
  label: string
}

export async function archiveBlockers(
  db: Reader,
  property: { id: string; businessDate: string },
): Promise<ArchiveBlocker[]> {
  const blockers: ArchiveBlocker[] = []
  const [upcoming] = await db
    .select({ value: count() })
    .from(reservations)
    .where(
      and(
        eq(reservations.propertyId, property.id),
        inArray(reservations.status, ['tentative', 'confirmed', 'checked_in']),
        gt(reservations.departure, property.businessDate),
      ),
    )
  const value = upcoming?.value ?? 0
  if (value > 0) {
    blockers.push({
      code: 'UPCOMING_RESERVATIONS',
      count: value,
      label: value === 1 ? '1 upcoming reservation' : `${value} upcoming reservations`,
    })
  }
  // Brick 9: a shift not closed still has money in its drawer.
  const [shifts] = await db
    .select({ value: count() })
    .from(cashierShifts)
    .where(and(eq(cashierShifts.propertyId, property.id), ne(cashierShifts.status, 'closed')))
  const open = shifts?.value ?? 0
  if (open > 0) {
    blockers.push({
      code: 'OPEN_SHIFTS',
      count: open,
      label: open === 1 ? '1 cashier shift open' : `${open} cashier shifts open`,
    })
  }
  return blockers
}
