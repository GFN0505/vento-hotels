// What stops a hotel being archived. Each later brick adds its check here, inside the archive
// transaction (spec: stage-1-hotels-and-companies.md, "Archive a hotel"):
// - brick 4: in-house guests, and future reservations that aren't cancelled;
// - bricks 9–10: folios with a balance, open cashier shifts;
// - Stage 3: open POS checks.
// Nothing is booked, posted or open yet, so for now nothing blocks.
import type { Reader } from './property-views.ts'

export type ArchiveBlocker = {
  code: string
  count: number
  // One line for the dialog, e.g. "12 guests in house".
  label: string
}

export async function archiveBlockers(
  _db: Reader,
  _property: { id: string },
): Promise<ArchiveBlocker[]> {
  return []
}
