// Using an approval inside the booking transaction (spec: "Using an approval at Book"). Lock order
// (reservations/locks.ts): the hotel's rates lock, inventory rows by room type then date, then
// approval rows by id (here), then the reservation counter. The approval is checked against what
// the server just priced and the approver's eligibility now, and marked used in the same
// transaction, so it is used once.
import type { Permission } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { approvals } from '../db/schema/approvals.ts'
import { devices } from '../db/schema/tenancy.ts'
import { type Access, scopeToProperties } from '../tenancy/access.ts'
import { candidate } from './eligibility.ts'
import {
  approvalExpired,
  approvalNoLongerValid,
  approvalNotFound,
  approvalNotGiven,
  approvalNotMatching,
  approvalUsed,
} from './errors.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export type UsedApproval = {
  id: string
  approverMemberId: string
  approverName: string
  // Their limit now, when it was used; null = any.
  approverLimit: string | null
  method: 'pin_here' | 'inbox'
  // Where the PIN was typed, for "Approved by Tunde Bello (PIN on FD-VI-01)".
  deviceName: string | null
}

export async function useApproval(
  tx: Tx,
  access: Access,
  ask: {
    approvalId: string
    kind: 'stay_discount'
    permission: Permission
    propertyId: string
    bindingHash: string
    businessDate: string
    timeZone: string
    now: Date
  },
): Promise<UsedApproval> {
  const [row] = await tx
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.id, ask.approvalId),
        eq(approvals.organizationId, access.organizationId),
        scopeToProperties(access, approvals.propertyId),
      ),
    )
    .for('update')
  // Another hotel's, another requester's or another kind's approval is simply not found here.
  if (
    !row ||
    row.propertyId !== ask.propertyId ||
    row.kind !== ask.kind ||
    row.requesterMemberId !== access.memberId
  ) {
    throw approvalNotFound()
  }
  const approverName = row.approverName ?? ''
  if (row.usedAt) throw approvalUsed(row.usedReference)
  if (row.status === 'expired') throw approvalExpired(approverName, row.expiresAt, ask.timeZone)
  if (row.status !== 'approved' || !row.approverMemberId || !row.method) {
    throw approvalNotGiven(row.approverName)
  }
  if (row.expiresAt.getTime() <= ask.now.getTime() || row.businessDate !== ask.businessDate) {
    throw approvalExpired(approverName, row.expiresAt, ask.timeZone)
  }
  if (row.bindingHash !== ask.bindingHash) throw approvalNotMatching(approverName)
  const approver = await candidate(
    tx,
    { organizationId: access.organizationId, propertyId: row.propertyId },
    ask.permission,
    row.value,
    row.approverMemberId,
  )
  if (!approver?.hasPin || approver.pinNeedsReset) {
    throw approvalNoLongerValid(approverName, row.value)
  }
  let deviceName: string | null = null
  if (row.method === 'pin_here' && row.approverDeviceId) {
    const [device] = await tx
      .select({ name: devices.name })
      .from(devices)
      .where(eq(devices.id, row.approverDeviceId))
    deviceName = device?.name ?? null
  }
  return {
    id: row.id,
    approverMemberId: row.approverMemberId,
    approverName: approver.name,
    approverLimit: approver.limit,
    method: row.method,
    deviceName,
  }
}

export async function markApprovalUsed(
  tx: Tx,
  id: string,
  used: { stayId: string; reference: string; at: Date },
): Promise<void> {
  await tx
    .update(approvals)
    .set({
      usedAt: used.at,
      usedEntityType: 'stay',
      usedEntityId: used.stayId,
      usedReference: used.reference,
      draft: null,
      updatedAt: used.at,
    })
    .where(eq(approvals.id, id))
}
