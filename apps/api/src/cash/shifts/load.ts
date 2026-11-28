// Finding a shift: in the caller's organization and hotels, else "not found" (another group's
// shift id looks exactly like an unknown one).
import { and, eq } from 'drizzle-orm'
import { cashierShifts } from '../../db/schema/cash.ts'
import { type Access, scopeToProperties } from '../../tenancy/access.ts'
import type { Reader, Tx } from '../context.ts'
import { notYourShift, shiftNotFound } from '../errors.ts'
import type { ShiftRow } from './views.ts'

const inScope = (access: Access, id: string) =>
  and(
    eq(cashierShifts.id, id),
    eq(cashierShifts.organizationId, access.organizationId),
    scopeToProperties(access, cashierShifts.propertyId),
  )

export async function findShift(db: Reader, access: Access, id: string): Promise<ShiftRow> {
  const [row] = await db.select().from(cashierShifts).where(inScope(access, id))
  if (!row) throw shiftNotFound()
  return row
}

// The shift row FOR UPDATE: submit and close (and from brick 10, payments FOR SHARE) meet here.
export async function lockShift(tx: Tx, access: Access, id: string): Promise<ShiftRow> {
  const [row] = await tx.select().from(cashierShifts).where(inScope(access, id)).for('update')
  if (!row) throw shiftNotFound()
  return row
}

// Only the shift's own person counts and closes it, whatever their role (brick 13 adds the
// absent-cashier close).
export function requireOwn(access: Access, row: ShiftRow): void {
  if (row.memberId !== access.memberId) throw notYourShift(row.memberName)
}
