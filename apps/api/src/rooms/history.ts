// Whether a room has history that must be kept, so it can only be archived, never deleted.
// Setup status changes don't count. Stays (brick 4), postings (brick 5) and housekeeping status
// changes (brick 7) extend this; their foreign keys to rooms also RESTRICT as a backstop.
import type { Reader } from './context.ts'

export async function hasHistory(_db: Reader, _roomId: string): Promise<boolean> {
  return false
}
