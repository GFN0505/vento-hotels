// Penalties (spec: "Waive the penalty"): recorded to charge, or waived with a reason by someone with
// penalty.waive or with their approval (kind penalty_waiver). Waived penalties are the owner's
// "penalty waived" exception (`exception: 'penalty_waived'` on reservation.penalty_waived).
import { newId, PENALTY_KIND_LABELS, type PenaltyKind } from '@vento/shared'
import { PENALTY_WAIVER } from '../../approvals/kinds/change-rules.ts'
import {
  lockApprovals,
  markApprovalUsed,
  type UsedApproval,
  useApproval,
} from '../../approvals/use.ts'
import type { AuditEvent } from '../../audit/record.ts'
import { penalties } from '../../db/schema/reservations.ts'
import { type Access, can } from '../../tenancy/access.ts'
import type { Tx } from '../context.ts'
import { waiverNeedsApproval } from './errors.ts'

export type Waiver = {
  reason: string
  approval: UsedApproval | null
}

// The waiver as sent with a cancel, no-show or change: direct with penalty.waive, else an approval
// bound to exactly this action (locked and used here, lock step 5).
export async function resolveWaiver(
  tx: Tx,
  access: Access,
  waive: { reason: string; approvalId?: string | undefined } | undefined,
  at: {
    propertyId: string
    businessDate: string
    timeZone: string
    now: Date
    bindingHash: string
  },
): Promise<Waiver | null> {
  if (!waive) return null
  if (!waive.approvalId) {
    if (!can(access, PENALTY_WAIVER.permission)) throw waiverNeedsApproval()
    return { reason: waive.reason.trim(), approval: null }
  }
  await lockApprovals(tx, access, [waive.approvalId])
  const approval = await useApproval(tx, access, {
    approvalId: waive.approvalId,
    kind: PENALTY_WAIVER.kind,
    permission: PENALTY_WAIVER.permission,
    propertyId: at.propertyId,
    bindingHash: at.bindingHash,
    businessDate: at.businessDate,
    timeZone: at.timeZone,
    now: at.now,
  })
  return { reason: waive.reason.trim(), approval }
}

export type PenaltyToRecord = {
  propertyId: string
  reservationId: string
  reservationNumber: string
  stayId: string
  changeId: string
  kind: PenaltyKind
  amount: string
  basis: Record<string, unknown>
  businessDate: string
  liveProperty: boolean
  // For the owner's report line ("VI-2611-0405 Deluxe King").
  roomTypeName: string
  guestName: string
}

// The waived columns, and the event every waiver writes. `actor` waived it (the requester, or the
// approver when an inbox approval applies it); `requestedBy` names the requester then.
export function waivedColumns(
  waiver: Waiver,
  by: { memberId: string; name: string },
  at: { now: Date; businessDate: string },
) {
  return {
    status: 'waived' as const,
    waivedAt: at.now,
    waivedByMemberId: by.memberId,
    waivedByName: by.name,
    waiverReason: waiver.reason,
    waiverBusinessDate: at.businessDate,
    approvalId: waiver.approval?.id ?? null,
    approverMemberId: waiver.approval?.approverMemberId ?? null,
    approverName: waiver.approval?.approverName ?? null,
  }
}

export function waivedEvent(
  penalty: Omit<PenaltyToRecord, 'changeId' | 'basis' | 'stayId'> & {
    id: string
    stayId: string
  },
  waiver: Waiver,
  extra: { businessDate: string; requestedBy?: { memberId: string; name: string } | null },
): AuditEvent {
  const approval = waiver.approval
  return {
    action: 'reservation.penalty_waived',
    entityType: 'reservation',
    entityId: penalty.reservationId,
    propertyId: penalty.propertyId,
    businessDate: extra.businessDate,
    reason: waiver.reason,
    approverMemberId: approval?.approverMemberId ?? null,
    after: {
      penaltyId: penalty.id,
      stayId: penalty.stayId,
      reservationNumber: penalty.reservationNumber,
      guestName: penalty.guestName,
      roomTypeName: penalty.roomTypeName,
      kind: penalty.kind,
      kindLabel: PENALTY_KIND_LABELS[penalty.kind],
      amount: penalty.amount,
      requestedBy: extra.requestedBy ?? null,
      approverMemberId: approval?.approverMemberId ?? null,
      ...(approval
        ? {
            approvalId: approval.id,
            approverName: approval.approverName,
            approvalMethod: approval.method,
            approvalDevice: approval.deviceName,
          }
        : {}),
      exception: 'penalty_waived',
      liveProperty: penalty.liveProperty,
    },
  }
}

// Inserts the penalty (to charge, or waived in the same transaction) and returns its events.
export async function recordPenalty(
  tx: Tx,
  access: Access,
  penalty: PenaltyToRecord,
  waiver: Waiver | null,
  now: Date,
): Promise<{ id: string; status: 'to_charge' | 'waived'; events: AuditEvent[] }> {
  const id = newId()
  await tx.insert(penalties).values({
    id,
    organizationId: access.organizationId,
    propertyId: penalty.propertyId,
    reservationId: penalty.reservationId,
    stayId: penalty.stayId,
    changeId: penalty.changeId,
    kind: penalty.kind,
    amount: penalty.amount,
    basis: penalty.basis,
    businessDate: penalty.businessDate,
    ...(waiver
      ? waivedColumns(
          waiver,
          { memberId: access.memberId, name: access.userName },
          { now, businessDate: penalty.businessDate },
        )
      : { status: 'to_charge' as const }),
  })
  const events: AuditEvent[] = [
    {
      action: 'penalty.recorded',
      entityType: 'reservation',
      entityId: penalty.reservationId,
      propertyId: penalty.propertyId,
      businessDate: penalty.businessDate,
      after: {
        penaltyId: id,
        stayId: penalty.stayId,
        changeId: penalty.changeId,
        reservationNumber: penalty.reservationNumber,
        kind: penalty.kind,
        amount: penalty.amount,
        basis: penalty.basis,
      },
    },
  ]
  if (waiver) {
    if (waiver.approval) {
      await markApprovalUsed(tx, waiver.approval.id, {
        entity: { type: 'penalty', id },
        reference: penalty.reservationNumber,
        at: now,
      })
    }
    events.push(waivedEvent({ ...penalty, id }, waiver, { businessDate: penalty.businessDate }))
  }
  return { id, status: waiver ? 'waived' : 'to_charge', events }
}
