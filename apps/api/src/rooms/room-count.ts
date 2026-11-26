// The one place a change to the number of active rooms in a type is announced. Every write that
// changes it (create, bulk create, archive, restore, delete, change type, type archive) calls this
// inside its transaction.
//
// Brick 4 fills it in: lock the types' room_type_inventory rows from the business date on, in
// ascending date order, adjust their totals, and refuse a change that would leave sold rooms above
// availability plus the overbooking limit. Nothing is sold yet, so for now there's nothing to do.
import type { Tx } from './context.ts'

export async function roomCountChanged(
  _tx: Tx,
  _change: { propertyId: string; roomTypeIds: readonly string[] },
): Promise<void> {}
