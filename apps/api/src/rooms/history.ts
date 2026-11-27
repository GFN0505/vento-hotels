// Whether a room has history that must be kept, so it can only be archived, never deleted.
// Setup status changes don't count. Stays assigned to it (bricks 7–8 assign rooms), postings (brick
// 10) and housekeeping status changes (brick 7) count; their foreign keys to rooms also RESTRICT as
// a backstop.
import { eq } from 'drizzle-orm'
import { stays } from '../db/schema/reservations.ts'
import type { Reader } from './context.ts'

export async function hasHistory(db: Reader, roomId: string): Promise<boolean> {
  const [stay] = await db
    .select({ id: stays.id })
    .from(stays)
    .where(eq(stays.roomId, roomId))
    .limit(1)
  return Boolean(stay)
}
