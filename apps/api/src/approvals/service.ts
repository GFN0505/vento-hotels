// Approvals (spec: docs/specs/stage-1-approvals.md, decision 0027). Every read and write filters by
// the organization from the auth context and the member's hotels. Approve, decline and cancel take
// the approval's row lock, so the first to commit wins. PIN checks share the lock screen's counter
// and always commit, so a wrong try sticks even though the answer is refused.
import type { ORPCError } from '@orpc/server'
import {
  type AnyApprovalSubject,
  APPROVAL_MINUTES,
  type ApprovalDetail,
  type ApprovalKind,
  type ApprovalView,
  type Approvers,
  type approvalActionSchema,
  type approveHereSchema,
  CANCEL_REASON_LABELS,
  type CancelReason,
  createReservationSchema,
  effectiveStatus,
  firstNameOf,
  formatPercent,
  type listApprovalsSchema,
  newId,
  overLimit,
  type Page,
  type Permission,
  pageOffset,
  type requestApprovalSchema,
  toPage,
  type WaiverSubject,
} from '@vento/shared'
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  not,
  or,
  type SQL,
} from 'drizzle-orm'
import type { z } from 'zod'
import { type AuditEvent, recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { approvals } from '../db/schema/approvals.ts'
import { members, users } from '../db/schema/auth.ts'
import { memberPins, properties } from '../db/schema/tenancy.ts'
import { type PinCheck, pinBlocked, tryPin } from '../devices/pin-counter.ts'
import { deviceBySecret, deviceSecretFrom } from '../devices/service.ts'
import {
  applyWaiver,
  findPenalty,
  lockPenalty,
  lockReservationRow,
} from '../reservations/change/waive.ts'
import { loadBookingHotel } from '../reservations/context.ts'
import { discountLimitOf } from '../reservations/pricing.ts'
import {
  type Access,
  can,
  propertyScope,
  requireFeature,
  scopeToProperties,
} from '../tenancy/access.ts'
import { hotelArchived, hotelNotFound } from '../tenancy/errors.ts'
import { approversFor, type Candidate, candidate, stillWorksAt } from './eligibility.ts'
import {
  approvalNotFound,
  approvalNotMatching,
  approverNotEligible,
  cantCancel,
  commentRequired,
  inboxNeedsRecordedPenalty,
  needsPin,
  notNeeded,
  notPending,
  pinHereNeedsDevice,
  pinLocked,
  pinNeedsReset,
  requesterLeft,
  selfApproval,
  tooManyOpenRequests,
  tooManyWrongPins,
  waiverNotNeeded,
  wrongPin,
} from './errors.ts'
import {
  evaluateModifyDiscount,
  evaluateWaiver,
  MODIFY_DISCOUNT,
  PENALTY_WAIVER,
} from './kinds/change-kinds.ts'
import { waiverBinding } from './kinds/change-rules.ts'
import { evaluateStayDiscount, STAY_DISCOUNT } from './kinds/stay-discount.ts'
import { countWrongTry, wrongTriesLeft } from './wrong-tries.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Reader = Pick<Database, 'select'>
type Action = z.output<typeof approvalActionSchema>
type Failure = { error: ORPCError<string, unknown> }

const MINUTES = APPROVAL_MINUTES * 60 * 1000
const later = (from: Date) => new Date(from.getTime() + MINUTES)

// The device this request comes from, when the browser is a live registered device of the group.
export async function thisDevice(db: Reader, access: Access, headers: Headers) {
  const device = await deviceBySecret(db, deviceSecretFrom(headers))
  if (!device || device.revokedAt || device.organizationId !== access.organizationId) return null
  return { id: device.id, name: device.name, propertyId: device.propertyId }
}

const rowColumns = {
  ...getTableColumns(approvals),
  hotelBusinessDate: properties.businessDate,
  timeZone: properties.timeZone,
  hotelArchivedAt: properties.archivedAt,
}

type Row = Awaited<ReturnType<typeof selectRows>>[number]

function selectRows(db: Reader, where: SQL | undefined) {
  return db
    .select(rowColumns)
    .from(approvals)
    .innerJoin(properties, eq(properties.id, approvals.propertyId))
    .where(where)
}

// The organization and the member's hotels: every approvals query starts here.
const inScope = (access: Access) =>
  and(
    eq(approvals.organizationId, access.organizationId),
    scopeToProperties(access, approvals.propertyId),
  ) as SQL

// Only the requester and the addressed approver ever see a request.
const mine = (access: Access) =>
  or(
    eq(approvals.requesterMemberId, access.memberId),
    eq(approvals.approverMemberId, access.memberId),
  )

function statusOf(row: Row, now: Date) {
  return effectiveStatus(
    { status: row.status, expiresAt: row.expiresAt, usedAt: row.usedAt },
    { asked: row.businessDate, now: row.hotelBusinessDate },
    now,
  )
}

function toView(row: Row, access: Access, now = new Date()): ApprovalView {
  const status = statusOf(row, now)
  return {
    id: row.id,
    kind: row.kind,
    propertyId: row.propertyId,
    status,
    method: row.method,
    value: row.value,
    subject: row.subject as ApprovalView['subject'],
    requester: { memberId: row.requesterMemberId, name: row.requesterName },
    approver:
      row.approverMemberId && row.approverName
        ? { memberId: row.approverMemberId, name: row.approverName }
        : null,
    comment: row.comment ?? (status === 'cancelled' ? row.reason : null),
    requestedAt: row.requestedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    answeredAt: row.answeredAt?.toISOString() ?? null,
    usedAt: row.usedAt?.toISOString() ?? null,
    usedFor: row.usedReference,
    role: row.requesterMemberId === access.memberId ? 'requester' : 'approver',
    hotelArchived: row.hotelArchivedAt !== null,
    timeZone: row.timeZone,
  }
}

async function loadRow(db: Reader, access: Access, id: string) {
  const [row] = await selectRows(db, and(inScope(access), eq(approvals.id, id), mine(access)))
  if (!row) throw approvalNotFound()
  return row
}

// The row, locked for an answer or a cancel (approve, decline and cancel race on this lock).
async function lockRow(tx: Tx, access: Access, id: string) {
  const [row] = await selectRows(tx, and(inScope(access), eq(approvals.id, id), mine(access))).for(
    'update',
    { of: approvals },
  )
  if (!row) throw approvalNotFound()
  return row
}

// Every kind registers its permission, how its value is measured and who is asked first; the
// action is evaluated with the kind's own functions (the client sends no figures).
type Evaluated = {
  kind: ApprovalKind
  permission: Permission
  valueKind: 'percent' | 'amount_ngn'
  hotel: { id: string; name: string; businessDate: string; timeZone: string }
  value: string
  bindingHash: string
  subject: AnyApprovalSubject
  // One open request per action: the booking's or change's key, or the penalty's id.
  actionKey: string
  // The booking to resume it ("Continue booking"); only for a new booking's discount.
  draft: unknown
  requesterLimit: string | null
  order: 'limit' | 'role'
}

async function evaluate(
  db: Pick<Database, 'select' | 'execute'>,
  access: Access,
  action: Action,
  now: Date,
  deviceName: string | null,
): Promise<Evaluated> {
  requireFeature(access, STAY_DISCOUNT.feature)
  const context = { now, deviceName }
  if (action.kind === 'stay_discount') {
    const e = await evaluateStayDiscount(db, access, action, context)
    return {
      kind: STAY_DISCOUNT.kind,
      permission: STAY_DISCOUNT.permission,
      valueKind: STAY_DISCOUNT.valueKind,
      hotel: e.hotel,
      value: e.value,
      bindingHash: e.bindingHash,
      subject: e.subject,
      actionKey: action.booking.idempotencyKey,
      draft: action.booking,
      requesterLimit: discountLimitOf(access),
      order: 'limit',
    }
  }
  if (action.kind === 'modify_discount') {
    const e = await evaluateModifyDiscount(db, access, action, context)
    return {
      ...e,
      kind: MODIFY_DISCOUNT.kind,
      permission: MODIFY_DISCOUNT.permission,
      valueKind: MODIFY_DISCOUNT.valueKind,
      draft: null,
      requesterLimit: discountLimitOf(access),
      order: 'limit',
    }
  }
  const e = await evaluateWaiver(db, access, action, context)
  return {
    ...e,
    kind: PENALTY_WAIVER.kind,
    permission: PENALTY_WAIVER.permission,
    valueKind: PENALTY_WAIVER.valueKind,
    draft: null,
    requesterLimit: null,
    order: 'role',
  }
}

// "15%", or "this waiver": what an approver is asked to approve, as people say it.
const whatOf = (kind: ApprovalKind, value: string) =>
  kind === 'penalty_waiver' ? 'this waiver' : `${formatPercent(value)}%`

// Asking only makes sense over the requester's own limit, or without the permission.
function requireNeeded(access: Access, evaluated: Evaluated) {
  if (evaluated.kind === 'penalty_waiver') {
    if (can(access, PENALTY_WAIVER.permission)) throw waiverNotNeeded()
    return
  }
  if (!overLimit(evaluated.value, discountLimitOf(access))) throw notNeeded(evaluated.value)
}

async function requireApprover(
  db: Reader,
  access: Access,
  evaluated: Evaluated,
  approverMemberId: string,
): Promise<Candidate> {
  if (approverMemberId === access.memberId) throw selfApproval()
  const where = { organizationId: access.organizationId, propertyId: evaluated.hotel.id }
  const found = await candidate(db, where, evaluated.permission, evaluated.value, approverMemberId)
  if (!found) {
    // Never reveals whether the id is a member elsewhere: the same words for anyone not eligible.
    const [named] = await db
      .select({ name: users.name })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(eq(members.id, approverMemberId), eq(members.organizationId, access.organizationId)),
      )
    throw approverNotEligible(
      named?.name ?? 'That person',
      whatOf(evaluated.kind, evaluated.value),
      evaluated.hotel.name,
    )
  }
  if (!found.hasPin) throw needsPin(found.name)
  if (found.pinNeedsReset) throw pinNeedsReset(`${firstNameOf(found.name)}'s`)
  return found
}

async function lockPin(tx: Tx, organizationId: string, memberId: string) {
  const [row] = await tx
    .select({
      pinId: memberPins.id,
      pinHash: memberPins.pinHash,
      failedAttempts: memberPins.failedAttempts,
      lockedUntil: memberPins.lockedUntil,
      lockCount: memberPins.lockCount,
      memberId: memberPins.memberId,
      name: users.name,
    })
    .from(memberPins)
    .innerJoin(members, eq(members.id, memberPins.memberId))
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(memberPins.memberId, memberId), eq(memberPins.organizationId, organizationId)))
    .for('update', { of: memberPins })
  return row
}

function pinFailure(
  check: Exclude<PinCheck, { ok: true }>,
  name: string,
  tz: string,
  own: boolean,
) {
  const whose = own ? 'Your' : `${firstNameOf(name)}'s`
  if (check.code === 'WRONG_PIN') return wrongPin(check.triesLeft)
  if (check.code === 'PIN_LOCKED') return pinLocked(whose, check.lockedUntil, tz, own)
  return pinNeedsReset(whose)
}

// Earlier open requests for the same booking are cancelled when it is asked again.
// Asking again for the same booking supersedes what was asked before: a pending request, and an
// approval given but not used, so one booking never holds two usable approvals.
const SUPERSEDED = 'Asked again'

async function cancelOthers(tx: Tx, access: Access, actionKey: string, businessDate: string) {
  const open = await tx
    .select({ id: approvals.id, status: approvals.status, propertyId: approvals.propertyId })
    .from(approvals)
    .where(
      and(
        eq(approvals.organizationId, access.organizationId),
        eq(approvals.requesterMemberId, access.memberId),
        eq(approvals.actionKey, actionKey),
        inArray(approvals.status, ['pending', 'approved']),
        isNull(approvals.usedAt),
      ),
    )
    .orderBy(asc(approvals.id))
    .for('update')
  if (open.length === 0) return
  await tx
    .update(approvals)
    .set({ status: 'cancelled', draft: null, reason: SUPERSEDED, updatedAt: new Date() })
    .where(
      inArray(
        approvals.id,
        open.map((row) => row.id),
      ),
    )
  for (const row of open) {
    await recordAudit(tx, access, {
      action: 'approval.cancelled',
      entityType: 'approval',
      entityId: row.id,
      propertyId: row.propertyId,
      businessDate,
      reason: SUPERSEDED,
      before: { status: row.status },
      after: { status: 'cancelled' },
    })
  }
}

// A requester can have a few requests waiting at once, not a flood of them.
export const MAX_OPEN_REQUESTS = 5

async function requireRoomForAnother(db: Reader, access: Access, actionKey: string, now: Date) {
  const [row] = await db
    .select({ value: count() })
    .from(approvals)
    .innerJoin(properties, eq(properties.id, approvals.propertyId))
    .where(
      and(
        eq(approvals.organizationId, access.organizationId),
        eq(approvals.requesterMemberId, access.memberId),
        not(eq(approvals.actionKey, actionKey)),
        openNow(now),
      ),
    )
  if ((row?.value ?? 0) >= MAX_OPEN_REQUESTS) throw tooManyOpenRequests(MAX_OPEN_REQUESTS)
}

// --- Asking ---------------------------------------------------------------------------------------

export type ThisDevice = Awaited<ReturnType<typeof thisDevice>>

export async function listApprovers(
  db: Database,
  access: Access,
  action: Action,
  device: ThisDevice,
): Promise<Approvers> {
  const evaluated = await evaluate(db, access, action, new Date(), device?.name ?? null)
  requireNeeded(access, evaluated)
  const found = await approversFor(
    db,
    { organizationId: access.organizationId, propertyId: evaluated.hotel.id },
    evaluated.permission,
    evaluated.value,
    access.memberId,
    evaluated.order,
  )
  return {
    approvers: found.approvers.map((c) => ({
      memberId: c.memberId,
      name: c.name,
      role: c.roleLabel,
      limit: c.limit,
    })),
    withoutPin: found.withoutPin,
    canApproveHere: device?.propertyId === evaluated.hotel.id,
    subject: evaluated.subject,
    value: evaluated.value,
  }
}

// Approve here: the approver types their PIN on the requester's screen, which must be a registered
// device of the hotel (a 4-digit PIN is safe only behind the device secret, decision 0022). The
// requester's session is unchanged; no session is made for the approver.
export async function approveHere(
  db: Database,
  access: Access,
  input: z.output<typeof approveHereSchema>,
  device: ThisDevice,
): Promise<ApprovalView> {
  // A double submit or a retry returns the approval already given, never a second one.
  const replayed = await replay(db, access, input.idempotencyKey)
  if (replayed) return replayed
  const now = new Date()
  const evaluated = await evaluate(db, access, input, now, device?.name ?? null)
  if (!device || device.propertyId !== evaluated.hotel.id) throw pinHereNeedsDevice()
  if (wrongTriesLeft(access.memberId) <= 0) throw tooManyWrongPins()
  requireNeeded(access, evaluated)
  const approver = await requireApprover(db, access, evaluated, input.approverMemberId)
  const businessDate = evaluated.hotel.businessDate
  const id = newId()
  let outcome: { id: string } | Failure
  try {
    outcome = await db.transaction(async (tx): Promise<{ id: string } | Failure> => {
      const pin = await lockPin(tx, access.organizationId, approver.memberId)
      if (!pin) return { error: needsPin(approver.name) }
      const checked = await tryPin(tx, pin, input.pin, {
        organizationId: access.organizationId,
        propertyId: evaluated.hotel.id,
        deviceId: device.id,
        deviceName: device.name,
        actorLabel: 'Approvals',
        actor: { ...access, deviceId: device.id },
      })
      if (!('ok' in checked)) {
        // A wrong PIN (or the one that locks it) counts against this desk as well as the approver.
        if (!pinBlocked(pin)) countWrongTry(access.memberId)
        return { error: pinFailure(checked, approver.name, evaluated.hotel.timeZone, false) }
      }
      await cancelOthers(tx, access, evaluated.actionKey, businessDate)
      await tx.insert(approvals).values({
        id,
        organizationId: access.organizationId,
        propertyId: evaluated.hotel.id,
        kind: evaluated.kind,
        permission: evaluated.permission,
        value: evaluated.value,
        valueKind: evaluated.valueKind,
        status: 'approved',
        method: 'pin_here',
        requesterMemberId: access.memberId,
        requesterName: access.userName,
        requesterLimit: evaluated.requesterLimit,
        approverMemberId: approver.memberId,
        approverName: approver.name,
        approverLimit: approver.limit,
        bindingHash: evaluated.bindingHash,
        subject: evaluated.subject,
        actionKey: evaluated.actionKey,
        businessDate,
        requestedAt: now,
        answeredAt: now,
        expiresAt: later(now),
        requestDeviceId: device.id,
        approverDeviceId: device.id,
        idempotencyKey: input.idempotencyKey,
      })
      await recordAudit(
        tx,
        { ...access, deviceId: device.id },
        {
          action: 'approval.granted',
          entityType: 'approval',
          entityId: id,
          propertyId: evaluated.hotel.id,
          businessDate,
          approverMemberId: approver.memberId,
          after: {
            approvalId: id,
            kind: evaluated.kind,
            permission: evaluated.permission,
            value: evaluated.value,
            method: 'pin_here',
            device: device.name,
            requesterMemberId: access.memberId,
            requesterName: access.userName,
            requesterLimit: evaluated.requesterLimit,
            approverName: approver.name,
            approverLimit: approver.limit,
            subject: evaluated.subject,
            expiresAt: later(now).toISOString(),
          },
        },
      )
      return { id }
    })
  } catch (error) {
    // The same key submitted twice at once: the second finds the first's approval.
    if (isUniqueViolation(error)) {
      const again = await replay(db, access, input.idempotencyKey)
      if (again) return again
    }
    throw error
  }
  if ('error' in outcome) throw outcome.error
  return toView(await loadRow(db, access, outcome.id), access, now)
}

// Ask in the inbox: a pending request to the one manager the requester picked, with what they see
// and, for the requester only, the booking to resume it. A double tap or a retry returns it again.
export async function requestApproval(
  db: Database,
  access: Access,
  input: z.output<typeof requestApprovalSchema>,
  device: ThisDevice,
): Promise<ApprovalView> {
  const replayed = await replay(db, access, input.idempotencyKey)
  if (replayed) return replayed
  const now = new Date()
  // A waiver goes to the inbox only for a penalty already recorded: the approver then applies it.
  if (input.kind === 'penalty_waiver' && input.waiver.target !== 'penalty') {
    throw inboxNeedsRecordedPenalty()
  }
  const evaluated = await evaluate(db, access, input, now, device?.name ?? null)
  requireNeeded(access, evaluated)
  const approver = await requireApprover(db, access, evaluated, input.approverMemberId)
  await requireRoomForAnother(db, access, evaluated.actionKey, now)
  const businessDate = evaluated.hotel.businessDate
  const id = newId()
  try {
    await db.transaction(async (tx) => {
      await cancelOthers(tx, access, evaluated.actionKey, businessDate)
      await tx.insert(approvals).values({
        id,
        organizationId: access.organizationId,
        propertyId: evaluated.hotel.id,
        kind: evaluated.kind,
        permission: evaluated.permission,
        value: evaluated.value,
        valueKind: evaluated.valueKind,
        status: 'pending',
        requesterMemberId: access.memberId,
        requesterName: access.userName,
        requesterLimit: evaluated.requesterLimit,
        approverMemberId: approver.memberId,
        approverName: approver.name,
        bindingHash: evaluated.bindingHash,
        subject: evaluated.subject,
        draft: evaluated.draft,
        actionKey: evaluated.actionKey,
        businessDate,
        requestedAt: now,
        expiresAt: later(now),
        requestDeviceId: device?.id ?? null,
        idempotencyKey: input.idempotencyKey,
      })
      await recordAudit(
        tx,
        { ...access, deviceId: device?.id ?? access.deviceId },
        {
          action: 'approval.requested',
          entityType: 'approval',
          entityId: id,
          propertyId: evaluated.hotel.id,
          businessDate,
          after: {
            approvalId: id,
            kind: evaluated.kind,
            permission: evaluated.permission,
            value: evaluated.value,
            requesterName: access.userName,
            requesterLimit: evaluated.requesterLimit,
            approverMemberId: approver.memberId,
            approverName: approver.name,
            subject: evaluated.subject,
            expiresAt: later(now).toISOString(),
          },
        },
      )
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = await replay(db, access, input.idempotencyKey)
      if (again) return again
    }
    throw error
  }
  return toView(await loadRow(db, access, id), access, now)
}

async function replay(db: Reader, access: Access, key: string) {
  const [row] = await selectRows(
    db,
    and(
      inScope(access),
      eq(approvals.idempotencyKey, key),
      eq(approvals.requesterMemberId, access.memberId),
    ),
  )
  return row ? toView(row, access) : undefined
}

// --- Reading --------------------------------------------------------------------------------------

export async function getApproval(
  db: Database,
  access: Access,
  id: string,
): Promise<ApprovalDetail> {
  const row = await loadRow(db, access, id)
  const view = toView(row, access)
  const open = view.status === 'pending' || (view.status === 'approved' && !view.usedAt)
  const draft =
    view.role === 'requester' && open && row.draft && row.kind === 'stay_discount'
      ? createReservationSchema.safeParse(row.draft)
      : undefined
  return { ...view, draft: draft?.success ? draft.data : null }
}

const openNow = (now: Date) =>
  and(
    eq(approvals.status, 'pending'),
    gt(approvals.expiresAt, now),
    eq(approvals.businessDate, properties.businessDate),
  ) as SQL

// The hotel picked in the top bar: in the member's scope; an archived hotel stays readable.
async function requireReadableHotel(db: Reader, access: Access, propertyId: string) {
  const [hotel] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), propertyScope(access)))
  if (!hotel) throw hotelNotFound()
}

function viewWhere(
  access: Access,
  input: {
    view: 'waiting' | 'asked' | 'done'
    propertyId?: string | undefined
    today?: boolean | undefined
  },
  now: Date,
) {
  const byView =
    input.view === 'waiting'
      ? and(eq(approvals.approverMemberId, access.memberId), openNow(now))
      : input.view === 'done'
        ? and(eq(approvals.approverMemberId, access.memberId), not(openNow(now)))
        : eq(approvals.requesterMemberId, access.memberId)
  return and(
    inScope(access),
    input.propertyId ? eq(approvals.propertyId, input.propertyId) : undefined,
    input.today ? eq(approvals.businessDate, properties.businessDate) : undefined,
    byView,
  ) as SQL
}

export async function listApprovals(
  db: Database,
  access: Access,
  input: z.output<typeof listApprovalsSchema>,
): Promise<Page<ApprovalView>> {
  if (input.propertyId) await requireReadableHotel(db, access, input.propertyId)
  const now = new Date()
  const where = viewWhere(access, input, now)
  const order = input.view === 'waiting' ? asc(approvals.requestedAt) : desc(approvals.requestedAt)
  const [rows, [total]] = await Promise.all([
    selectRows(db, where)
      .orderBy(order, asc(approvals.id))
      .limit(input.pageSize)
      .offset(pageOffset(input)),
    db
      .select({ value: count() })
      .from(approvals)
      .innerJoin(properties, eq(properties.id, approvals.propertyId))
      .where(where),
  ])
  return toPage(
    rows.map((row) => toView(row, access, now)),
    total?.value ?? 0,
    input,
  )
}

export async function countWaiting(
  db: Database,
  access: Access,
  input: { propertyId?: string | undefined },
): Promise<{ waiting: number }> {
  if (input.propertyId) await requireReadableHotel(db, access, input.propertyId)
  const [row] = await db
    .select({ value: count() })
    .from(approvals)
    .innerJoin(properties, eq(properties.id, approvals.propertyId))
    .where(viewWhere(access, { view: 'waiting', propertyId: input.propertyId }, new Date()))
  return { waiting: row?.value ?? 0 }
}

// --- Answering ------------------------------------------------------------------------------------

function requireAnswerable(row: Row, access: Access, now: Date) {
  if (row.approverMemberId !== access.memberId) {
    // The requester reading their own request can't answer it.
    if (row.requesterMemberId === access.memberId) throw selfApproval()
    throw approvalNotFound()
  }
  const status = statusOf(row, now)
  if (status !== 'pending') {
    throw notPending({
      status,
      requesterName: row.requesterName,
      answeredAt: row.answeredAt,
      expiresAt: row.expiresAt,
      updatedAt: row.updatedAt,
      usedAt: row.usedAt,
      timeZone: row.timeZone,
    })
  }
  if (row.hotelArchivedAt) throw hotelArchived()
}

// Approve from the inbox: the addressed approver, from any session, with their own PIN.
export async function approveRequest(
  db: Database,
  access: Access,
  input: { id: string; pin: string; comment?: string | undefined },
): Promise<ApprovalView> {
  requireFeature(access, STAY_DISCOUNT.feature)
  const now = new Date()
  // A waiver is applied in this transaction (decision 0028), so it locks its reservation first
  // (lock step 2b, looked up without a lock), then the approval, then the PIN, then the penalty:
  // the same order as a cancel or a waiver from the Penalty card, so they can't deadlock.
  const peek = await loadRow(db, access, input.id)
  const outcome = await db.transaction(async (tx): Promise<{ ok: true } | Failure> => {
    if (peek.kind === PENALTY_WAIVER.kind) {
      await lockReservationRow(tx, (peek.subject as WaiverSubject).reservationId)
    }
    const row = await lockRow(tx, access, input.id)
    requireAnswerable(row, access, now)
    const where = { organizationId: access.organizationId, propertyId: row.propertyId }
    const hotel = (row.subject as { hotelName: string }).hotelName
    if (!(await stillWorksAt(tx, access.organizationId, row.propertyId, row.requesterMemberId))) {
      throw requesterLeft(row.requesterName, hotel)
    }
    const me = await candidate(tx, where, row.permission as Permission, row.value, access.memberId)
    if (!me) throw approverNotEligible(access.userName, whatOf(row.kind, row.value), hotel)
    const pin = await lockPin(tx, access.organizationId, access.memberId)
    if (!pin) throw needsPin(access.userName)
    const blocked = pinBlocked(pin, now)
    if (blocked) return { error: pinFailure(blocked, access.userName, row.timeZone, true) }
    const checked = await tryPin(tx, pin, input.pin, {
      organizationId: access.organizationId,
      propertyId: row.propertyId,
      deviceId: access.deviceId,
      deviceName: null,
      actorLabel: 'Approvals',
      actor: access,
    })
    if (!('ok' in checked))
      return { error: pinFailure(checked, access.userName, row.timeZone, true) }
    const comment = input.comment?.trim() || null
    await tx
      .update(approvals)
      .set({
        status: 'approved',
        method: 'inbox',
        approverName: access.userName,
        approverLimit: me.limit,
        comment,
        answeredAt: now,
        expiresAt: later(now),
        approverDeviceId: access.deviceId,
        updatedAt: now,
      })
      .where(eq(approvals.id, row.id))
    await recordAudit(tx, access, {
      action: 'approval.granted',
      entityType: 'approval',
      entityId: row.id,
      propertyId: row.propertyId,
      businessDate: row.businessDate,
      approverMemberId: access.memberId,
      after: {
        approvalId: row.id,
        method: 'inbox',
        value: row.value,
        approverName: access.userName,
        approverLimit: me.limit,
        requesterMemberId: row.requesterMemberId,
        requesterName: row.requesterName,
        comment,
        expiresAt: later(now).toISOString(),
      },
    })
    if (row.kind === PENALTY_WAIVER.kind) await applyInboxWaiver(tx, access, row, now)
    return { ok: true }
  })
  if ('error' in outcome) throw outcome.error
  return toView(await loadRow(db, access, input.id), access)
}

// Decision 0028: the penalty a waiver binds to is already recorded and can't change, so the
// approver's yes applies it at once, in their transaction; the requester needn't come back. The
// approver acts; the requester is named on the event (`requestedBy`) and as who waived it.
async function applyInboxWaiver(tx: Tx, access: Access, row: Row, now: Date) {
  const subject = row.subject as WaiverSubject
  if (!subject.penaltyId) throw inboxNeedsRecordedPenalty()
  const found = await findPenalty(tx, access, subject.penaltyId)
  const hotel = await loadBookingHotel(tx, access, found.propertyId)
  const penalty = await lockPenalty(tx, found.id)
  const binding = waiverBinding({
    propertyId: penalty.propertyId,
    reservationId: penalty.reservationId,
    target: 'penalty',
    version: null,
    penaltyKind: penalty.kind,
    amount: penalty.amount,
    changeHash: null,
    penaltyId: penalty.id,
    reason: subject.waiverReason,
  })
  if (binding !== row.bindingHash) throw approvalNotMatching(access.userName)
  const requester = { memberId: row.requesterMemberId, name: row.requesterName }
  await applyWaiver(
    tx,
    access,
    hotel,
    penalty,
    {
      reason: subject.waiverReason,
      approval: {
        id: row.id,
        approverMemberId: access.memberId,
        approverName: access.userName,
        approverLimit: null,
        method: 'inbox',
        deviceName: null,
      },
    },
    { idempotencyKey: newId(), requestHash: row.id, requestedBy: requester, by: requester, now },
  )
}

export async function declineRequest(
  db: Database,
  access: Access,
  input: { id: string; comment: string },
): Promise<ApprovalView> {
  requireFeature(access, STAY_DISCOUNT.feature)
  const now = new Date()
  await db.transaction(async (tx) => {
    const row = await lockRow(tx, access, input.id)
    requireAnswerable(row, access, now)
    const comment = input.comment.trim()
    if (!comment) throw commentRequired(row.requesterName)
    await tx
      .update(approvals)
      .set({
        status: 'declined',
        method: 'inbox',
        comment,
        draft: null,
        answeredAt: now,
        approverDeviceId: access.deviceId,
        updatedAt: now,
      })
      .where(eq(approvals.id, row.id))
    await recordAudit(tx, access, {
      action: 'approval.declined',
      entityType: 'approval',
      entityId: row.id,
      propertyId: row.propertyId,
      businessDate: row.businessDate,
      reason: comment,
      approverMemberId: access.memberId,
      after: {
        approvalId: row.id,
        value: row.value,
        approverName: access.userName,
        requesterMemberId: row.requesterMemberId,
        requesterName: row.requesterName,
      },
    })
  })
  return toView(await loadRow(db, access, input.id), access)
}

// The requester withdraws a pending request. An approval already given isn't withdrawn: the first
// answer wins, and one that no longer matches the booking simply expires unused.
export async function cancelRequest(
  db: Database,
  access: Access,
  input: { id: string; reason: CancelReason },
): Promise<ApprovalView> {
  const now = new Date()
  await db.transaction(async (tx) => {
    const row = await lockRow(tx, access, input.id)
    if (row.requesterMemberId !== access.memberId) throw approvalNotFound()
    const status = statusOf(row, now)
    if (status !== 'pending') throw cantCancel(status)
    const reason = CANCEL_REASON_LABELS[input.reason]
    await tx
      .update(approvals)
      .set({ status: 'cancelled', draft: null, reason, updatedAt: now })
      .where(eq(approvals.id, row.id))
    const event: AuditEvent = {
      action: 'approval.cancelled',
      entityType: 'approval',
      entityId: row.id,
      propertyId: row.propertyId,
      businessDate: row.businessDate,
      reason,
      before: { status: row.status },
      after: { status: 'cancelled', approverName: row.approverName },
    }
    await recordAudit(tx, access, event)
  })
  return toView(await loadRow(db, access, input.id), access)
}
