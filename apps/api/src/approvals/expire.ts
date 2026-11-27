// The approvals.expire job (every minute): stores as expired every open approval past its time or
// its business date, clears its draft and writes one approval.expired system event each. Idempotent
// (only open rows move), and reads never depend on its timing: they compare the time themselves.
// Night audit (brick 13) runs the same before rolling a hotel's date.
import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { recordSystemAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { approvals } from '../db/schema/approvals.ts'
import { properties } from '../db/schema/tenancy.ts'

export async function expireApprovals(db: Database, now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    const due = and(
      inArray(approvals.status, ['pending', 'approved']),
      isNull(approvals.usedAt),
      or(
        lte(approvals.expiresAt, now),
        sql`exists (select 1 from ${properties} where ${properties.id} = ${approvals.propertyId} and ${ne(properties.businessDate, approvals.businessDate)})`,
      ),
    )
    // In id order, skipping rows a booking holds: the job never waits on a booking (it gets them
    // next minute if still unused), and never locks in an order a booking could cross.
    const ids = (
      await tx
        .select({ id: approvals.id })
        .from(approvals)
        .where(due)
        .orderBy(asc(approvals.id))
        .for('update', { skipLocked: true })
    ).map((row) => row.id)
    if (ids.length === 0) return 0
    const expired = await tx
      .update(approvals)
      .set({ status: 'expired', draft: null, updatedAt: now })
      .where(and(inArray(approvals.id, ids), due))
      .returning({
        id: approvals.id,
        organizationId: approvals.organizationId,
        propertyId: approvals.propertyId,
        // The status before this update is gone; an answered row was approved, else pending.
        answeredAt: approvals.answeredAt,
        requestedAt: approvals.requestedAt,
        requesterName: approvals.requesterName,
        approverName: approvals.approverName,
        businessDate: approvals.businessDate,
        value: approvals.value,
      })
    for (const row of expired) {
      await recordSystemAudit(
        tx,
        row.organizationId,
        {
          action: 'approval.expired',
          entityType: 'approval',
          entityId: row.id,
          propertyId: row.propertyId,
          after: {
            approvalId: row.id,
            was: row.answeredAt ? 'approved' : 'pending',
            askedAt: row.requestedAt.toISOString(),
            requesterName: row.requesterName,
            approverName: row.approverName,
            value: row.value,
            businessDate: row.businessDate,
          },
        },
        'Approvals',
      )
    }
    return expired.length
  })
}

// Used by tests: an approval's stored status.
export async function storedStatus(db: Database, id: string) {
  const [row] = await db
    .select({ status: approvals.status, draft: approvals.draft })
    .from(approvals)
    .where(eq(approvals.id, id))
  return row
}
