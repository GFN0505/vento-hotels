// In-house stays keep their room per night (decision 0030): a move or a change touches the nights
// from the business date on; the nights before stay in the room they were in, as a segment.
import { nightsBetween } from '@vento/shared'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { stayRoomSegments } from '../db/schema/front-desk.ts'
import type { Reader, Tx } from './context.ts'

type StayLike = { id: string; status: string; arrival: string; roomFrom: string | null }
type RoomLike = { id: string; roomTypeId: string }

// The first night a change can touch: the business date for a guest already in house.
export const nightsFrom = (stay: Pick<StayLike, 'status' | 'arrival'>, businessDate: string) =>
  stay.status === 'checked_in' && stay.arrival < businessDate ? businessDate : stay.arrival

// Keeps the nights before the business date in `previous` and returns the stay's new `roomFrom`.
// A second move on the same business date keeps nothing (no night was used in between); moving
// back into the room just left (Undo) joins the nights up again.
export async function keepEarlierNights(
  tx: Tx,
  scope: { organizationId: string; propertyId: string },
  stay: StayLike,
  previous: RoomLike,
  target: RoomLike,
  businessDate: string,
): Promise<{ roomFrom: string | null; nightsKept: number }> {
  const start = stay.roomFrom ?? stay.arrival
  if (start >= businessDate) {
    const [last] = await tx
      .select()
      .from(stayRoomSegments)
      .where(eq(stayRoomSegments.stayId, stay.id))
      .orderBy(desc(stayRoomSegments.toDate))
      .limit(1)
    if (last && last.toDate === start && last.roomId === target.id) {
      await tx.delete(stayRoomSegments).where(eq(stayRoomSegments.id, last.id))
      return { roomFrom: last.fromDate === stay.arrival ? null : last.fromDate, nightsKept: 0 }
    }
    return { roomFrom: stay.roomFrom, nightsKept: 0 }
  }
  await tx.insert(stayRoomSegments).values({
    ...scope,
    stayId: stay.id,
    roomId: previous.id,
    roomTypeId: previous.roomTypeId,
    fromDate: start,
    toDate: businessDate,
  })
  return { roomFrom: businessDate, nightsKept: nightsBetween(start, businessDate) }
}

// The earlier rooms of some stays, oldest first.
export async function segmentsForStays(
  db: Reader,
  scope: { organizationId: string; propertyId: string },
  stayIds: readonly string[],
) {
  if (stayIds.length === 0) return []
  return db
    .select()
    .from(stayRoomSegments)
    .where(
      and(
        eq(stayRoomSegments.organizationId, scope.organizationId),
        eq(stayRoomSegments.propertyId, scope.propertyId),
        inArray(stayRoomSegments.stayId, [...stayIds]),
      ),
    )
    .orderBy(asc(stayRoomSegments.fromDate))
}
