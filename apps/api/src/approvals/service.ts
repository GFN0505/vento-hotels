// Approvals (spec: docs/specs/stage-1-approvals.md, decision 0027). Every read and write filters by
// the organization from the auth context and the member's hotels. Approve, decline and cancel take
// the approval's row lock, so the first to commit wins. PIN checks share the lock screen's counter
// and always commit, so a wrong try sticks even though the answer is refused.
import type { ORPCError } from '@orpc/server'
import {
  APPROVAL_MINUTES,
  type ApprovalDetail,
  type ApprovalView,
  type Approvers,
  type approvalActionSchema,
  type approveHereSchema,
  CANCEL_REASON_LABELS,
  type CancelReason,
  createReservationSchema,
  effectiveStatus,
  firstNameOf,
  type listApprovalsSchema,
  newId,
  overLimit,
  type Page,
  pageOffset,
  type requestApprovalSchema,
  toPage,
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
import { discountLimitOf } from '../reservations/pricing.ts'
import { type Access, propertyScope, requireFeature, scopeToProperties } from '../tenancy/access.ts'
import { hotelArchived, hotelNotFound } from '../tenancy/errors.ts'
import { approversFor, type Candidate, candidate, stillWorksAt } from './eligibility.ts'
import {
  approvalNotFound,
  approverNotEligible,
  cantCancel,
  commentRequired,
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
  wrongPin,
} from './errors.ts'
import { type EvaluatedStay, evaluateStayDiscount, STAY_DISCOUNT } from './kinds/stay-discount.ts'
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

function evaluate(
  db: Pick<Database, 'select' | 'execute'>,
  access: Access,
  action: Action,
  now: Date,
  deviceName: string | null,
) {
  requireFeature(access, STAY_DISCOUNT.feature)
  return evaluateStayDiscount(db, access, action, { now, deviceName })
}

// Asking only makes sense over the requester's own limit.
function requireOverLimit(access: Access, value: string) {
  if (!overLimit(value, discountLimitOf(access))) throw notNeeded(value)
}

async function requireApprover(
  db: Reader,
  access: Access,
  evaluated: EvaluatedStay,
  approverMemberId: string,
): Promise<Candidate> {
  if (approverMemberId === access.memberId) throw selfApproval()
  const where = { organizationId: access.organizationId, propertyId: evaluated.hotel.id }
  const found = await candidate(
    db,
    where,
    STAY_DISCOUNT.permission,
    evaluated.value,
    approverMemberId,
  )
  if (!found) {
    // Never reveals whether the id is a member elsewhere: the same words for anyone not eligible.
    const [named] = await db
      .select({ name: users.name })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(eq(members.id, approverMemberId), eq(members.organizationId, access.organizationId)),
      )
    throw approverNotEligible(named?.name ?? 'That person', evaluated.value, evaluated.hotel.name)
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
  requireOverLimit(access, evaluated.value)
  const found = await approversFor(
    db,
    { organizationId: access.organizationId, propertyId: evaluated.hotel.id },
    STAY_DISCOUNT.permission,
    evaluated.value,
    access.memberId,
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
  requireOverLimit(access, evaluated.value)
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
      await cancelOthers(tx, access, input.booking.idempotencyKey, businessDate)
      await tx.insert(approvals).values({
        id,
        organizationId: access.organizationId,
        propertyId: evaluated.hotel.id,
        kind: STAY_DISCOUNT.kind,
        permission: STAY_DISCOUNT.permission,
        value: evaluated.value,
        valueKind: STAY_DISCOUNT.valueKind,
        status: 'approved',
        method: 'pin_here',
        requesterMemberId: access.memberId,
        requesterName: access.userName,
        requesterLimit: discountLimitOf(access),
        approverMemberId: approver.memberId,
        approverName: approver.name,
        approverLimit: approver.limit,
        bindingHash: evaluated.bindingHash,
        subject: evaluated.subject,
        actionKey: input.booking.idempotencyKey,
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
            kind: STAY_DISCOUNT.kind,
            permission: STAY_DISCOUNT.permission,
            value: evaluated.value,
            method: 'pin_here',
            device: device.name,
            requesterMemberId: access.memberId,
            requesterName: access.userName,
            requesterLimit: discountLimitOf(access),
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
  const evaluated = await evaluate(db, access, input, now, device?.name ?? null)
  requireOverLimit(access, evaluated.value)
  const approver = await requireApprover(db, access, evaluated, input.approverMemberId)
  await requireRoomForAnother(db, access, input.booking.idempotencyKey, now)
  const businessDate = evaluated.hotel.businessDate
  const id = newId()
  try {
    await db.transaction(async (tx) => {
      await cancelOthers(tx, access, input.booking.idempotencyKey, businessDate)
      await tx.insert(approvals).values({
        id,
        organizationId: access.organizationId,
        propertyId: evaluated.hotel.id,
        kind: STAY_DISCOUNT.kind,
        permission: STAY_DISCOUNT.permission,
        value: evaluated.value,
        valueKind: STAY_DISCOUNT.valueKind,
        status: 'pending',
        requesterMemberId: access.memberId,
        requesterName: access.userName,
        requesterLimit: discountLimitOf(access),
        approverMemberId: approver.memberId,
        approverName: approver.name,
        bindingHash: evaluated.bindingHash,
        subject: evaluated.subject,
        draft: input.booking,
        actionKey: input.booking.idempotencyKey,
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
            kind: STAY_DISCOUNT.kind,
            permission: STAY_DISCOUNT.permission,
            value: evaluated.value,
            requesterName: access.userName,
            requesterLimit: discountLimitOf(access),
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
    view.role === 'requester' && open && row.draft
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
  const outcome = await db.transaction(async (tx): Promise<{ ok: true } | Failure> => {
    const row = await lockRow(tx, access, input.id)
    requireAnswerable(row, access, now)
    const where = { organizationId: access.organizationId, propertyId: row.propertyId }
    const hotel = (row.subject as { hotelName: string }).hotelName
    if (!(await stillWorksAt(tx, access.organizationId, row.propertyId, row.requesterMemberId))) {
      throw requesterLeft(row.requesterName, hotel)
    }
    const me = await candidate(tx, where, STAY_DISCOUNT.permission, row.value, access.memberId)
    if (!me) throw approverNotEligible(access.userName, row.value, hotel)
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
    return { ok: true }
  })
  if ('error' in outcome) throw outcome.error
  return toView(await loadRow(db, access, input.id), access)
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
