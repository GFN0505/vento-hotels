// Penalties as the detail's Penalty card shows them: amount, basis, status, who waived it and why,
// and the latest waiver request asked for it from the Penalty card or a dialog's inbox path.
import { effectiveStatus, type PenaltyView, penaltyBasisLabel } from '@vento/shared'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { approvals } from '../../db/schema/approvals.ts'
import { penalties } from '../../db/schema/reservations.ts'
import { properties } from '../../db/schema/tenancy.ts'
import type { Access } from '../../tenancy/access.ts'
import type { Reader } from '../context.ts'
import { penaltyNotFound } from './errors.ts'

type PenaltyRow = typeof penalties.$inferSelect

function basisLabelOf(row: PenaltyRow): string {
  const basis = row.basis as { basis?: string; policy?: { penalty?: { percent?: string } } }
  if (row.kind === 'late_change') return 'Lower stay total'
  const kind = basis.basis as Parameters<typeof penaltyBasisLabel>[0] | undefined
  return penaltyBasisLabel(kind ?? 'first_night', basis.policy?.penalty?.percent ?? null)
}

async function requestsFor(db: Reader, access: Access, penaltyIds: string[]) {
  if (penaltyIds.length === 0) return new Map<string, PenaltyView['request']>()
  const rows = await db
    .select({
      id: approvals.id,
      actionKey: approvals.actionKey,
      status: approvals.status,
      expiresAt: approvals.expiresAt,
      usedAt: approvals.usedAt,
      approverName: approvals.approverName,
      comment: approvals.comment,
      requesterMemberId: approvals.requesterMemberId,
      businessDate: approvals.businessDate,
      hotelBusinessDate: properties.businessDate,
    })
    .from(approvals)
    .innerJoin(properties, eq(properties.id, approvals.propertyId))
    .where(
      and(
        eq(approvals.organizationId, access.organizationId),
        eq(approvals.kind, 'penalty_waiver'),
        inArray(approvals.actionKey, penaltyIds),
      ),
    )
    .orderBy(desc(approvals.requestedAt))
  const out = new Map<string, PenaltyView['request']>()
  const now = new Date()
  for (const row of rows) {
    if (out.has(row.actionKey)) continue
    const status = effectiveStatus(
      { status: row.status, expiresAt: row.expiresAt, usedAt: row.usedAt },
      { asked: row.businessDate, now: row.hotelBusinessDate },
      now,
    )
    out.set(row.actionKey, {
      approvalId: row.id,
      status,
      approverName: row.approverName ?? '',
      expiresAt: row.expiresAt.toISOString(),
      comment: row.comment,
      mine: row.requesterMemberId === access.memberId,
    })
  }
  return out
}

function toView(row: PenaltyRow, request: PenaltyView['request'] | undefined): PenaltyView {
  const waived =
    row.status === 'waived' && row.waivedAt && row.waivedByName && row.waiverReason
      ? {
          byName: row.waivedByName,
          at: row.waivedAt.toISOString(),
          reason: row.waiverReason,
          approverName: row.approverName,
          method: null,
        }
      : null
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    basisLabel: basisLabelOf(row),
    status: row.status,
    businessDate: row.businessDate,
    waived,
    request: row.status === 'to_charge' ? (request ?? null) : null,
  }
}

export async function penaltiesOf(
  db: Reader,
  access: Access,
  reservationId: string,
): Promise<PenaltyView[]> {
  const rows = await db
    .select()
    .from(penalties)
    .where(
      and(
        eq(penalties.organizationId, access.organizationId),
        eq(penalties.reservationId, reservationId),
      ),
    )
    .orderBy(asc(penalties.createdAt))
  const requests = await requestsFor(
    db,
    access,
    rows.map((row) => row.id),
  )
  // Method of an approval that waived it: from the approval row.
  const approvalIds = rows.flatMap((row) => (row.approvalId ? [row.approvalId] : []))
  const methods = new Map(
    approvalIds.length
      ? (
          await db
            .select({ id: approvals.id, method: approvals.method })
            .from(approvals)
            .where(inArray(approvals.id, approvalIds))
        ).map((a) => [a.id, a.method])
      : [],
  )
  return rows.map((row) => {
    const view = toView(row, requests.get(row.id))
    if (view.waived && row.approvalId) view.waived.method = methods.get(row.approvalId) ?? null
    return view
  })
}

export async function penaltyView(
  db: Reader,
  access: Access,
  penaltyId: string,
): Promise<PenaltyView> {
  const [row] = await db
    .select({ reservationId: penalties.reservationId })
    .from(penalties)
    .where(and(eq(penalties.id, penaltyId), eq(penalties.organizationId, access.organizationId)))
  if (!row) throw penaltyNotFound()
  const all = await penaltiesOf(db, access, row.reservationId)
  const found = all.find((p) => p.id === penaltyId)
  if (!found) throw penaltyNotFound()
  return found
}
