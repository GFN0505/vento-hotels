// Reading shifts: My shift (with the open form's drawers), the Shifts list and a shift's detail.
// Members with `leakage.view` read every shift of the hotel; everyone else their own. An open
// shift's row and detail carry the float and nothing about takings.
import {
  addDays,
  type DrawerChoice,
  type MyShift,
  type Page,
  pageOffset,
  type ShiftDetail,
  type ShiftRow as ShiftListRow,
  type ShiftSegment,
  toPage,
} from '@vento/shared'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { approvals } from '../../db/schema/approvals.ts'
import { cashDrawers, cashierShiftCountLines, cashierShifts } from '../../db/schema/cash.ts'
import { auditEvents } from '../../db/schema/governance.ts'
import { devices } from '../../db/schema/tenancy.ts'
import type { Access } from '../../tenancy/access.ts'
import {
  cashHotel,
  type ListReader,
  type Reader,
  readsAll,
  requireOperate,
  requireShiftReader,
  varianceLimit,
} from '../context.ts'
import { terminalsAt } from '../drawers/service.ts'
import { shiftNotFound } from '../errors.ts'
import { findShift } from './load.ts'
import { myOpenShift } from './open.ts'
import { toShiftView } from './views.ts'

async function drawerChoices(db: ListReader, access: Access, propertyId: string) {
  const drawers = await db
    .select({ id: cashDrawers.id, name: cashDrawers.name })
    .from(cashDrawers)
    .where(
      and(
        eq(cashDrawers.organizationId, access.organizationId),
        eq(cashDrawers.propertyId, propertyId),
        isNull(cashDrawers.archivedAt),
      ),
    )
    .orderBy(asc(cashDrawers.name), asc(cashDrawers.id))
  const ids = drawers.map((d) => d.id)
  if (ids.length === 0) return [] as DrawerChoice[]
  const [terminals, busy, last] = await Promise.all([
    terminalsAt(db, ids),
    db
      .select({
        drawerId: cashierShifts.drawerId,
        memberId: cashierShifts.memberId,
        memberName: cashierShifts.memberName,
        number: cashierShifts.number,
      })
      .from(cashierShifts)
      .where(and(inArray(cashierShifts.drawerId, ids), ne(cashierShifts.status, 'closed'))),
    db
      .selectDistinctOn([cashierShifts.drawerId], {
        drawerId: cashierShifts.drawerId,
        shiftId: cashierShifts.id,
        number: cashierShifts.number,
        businessDate: cashierShifts.businessDate,
        memberName: cashierShifts.memberName,
        closedAt: cashierShifts.closedAt,
        floatKept: cashierShifts.floatKept,
      })
      .from(cashierShifts)
      .where(and(inArray(cashierShifts.drawerId, ids), eq(cashierShifts.status, 'closed')))
      .orderBy(cashierShifts.drawerId, desc(cashierShifts.openedAt), desc(cashierShifts.id)),
  ])
  return drawers.map((drawer): DrawerChoice => {
    const now = busy.find((b) => b.drawerId === drawer.id)
    const closed = last.find((l) => l.drawerId === drawer.id)
    return {
      id: drawer.id,
      name: drawer.name,
      terminals: (terminals.get(drawer.id) ?? []).filter((t) => !t.archived),
      busy: now
        ? { memberName: now.memberName, number: now.number, mine: now.memberId === access.memberId }
        : null,
      lastClose:
        closed?.closedAt && closed.floatKept
          ? {
              shiftId: closed.shiftId,
              number: closed.number,
              businessDate: closed.businessDate,
              memberName: closed.memberName,
              closedAt: closed.closedAt.toISOString(),
              floatKept: closed.floatKept,
            }
          : null,
    }
  })
}

export async function myShift(
  db: ListReader,
  access: Access,
  input: { propertyId: string },
): Promise<MyShift> {
  requireOperate(access)
  const hotel = await cashHotel(db, access, input.propertyId)
  const mine = await myOpenShift(db, access)
  let shift: MyShift['shift'] = null
  if (mine && mine.propertyId === hotel.id) {
    const row = await findShift(db, access, mine.id)
    shift = await toShiftView(db, row, { timeZone: hotel.timeZone, limit: varianceLimit(access) })
  }
  return {
    hotel: {
      id: hotel.id,
      name: hotel.name,
      businessDate: hotel.businessDate,
      timeZone: hotel.timeZone,
      archived: hotel.archived,
    },
    shift,
    elsewhere:
      mine && mine.propertyId !== hotel.id
        ? {
            propertyId: mine.propertyId,
            hotelName: mine.hotelName,
            number: mine.number,
            drawerName: mine.drawerName,
          }
        : null,
    drawers: hotel.archived ? [] : await drawerChoices(db, access, hotel.id),
    limit: varianceLimit(access),
  }
}

const segmentWhere = (segment: ShiftSegment): SQL | undefined => {
  if (segment === 'open') return ne(cashierShifts.status, 'closed')
  if (segment === 'difference') {
    return or(
      ne(cashierShifts.handoverDifference, '0'),
      and(ne(cashierShifts.status, 'open'), ne(cashierShifts.totalDifference, '0')),
    )
  }
  return undefined
}

export async function listShifts(
  db: Reader,
  access: Access,
  input: {
    propertyId: string
    segment: ShiftSegment
    from?: string | undefined
    to?: string | undefined
    page: number
    pageSize: number
  },
): Promise<Page<ShiftListRow>> {
  requireShiftReader(access)
  const hotel = await cashHotel(db, access, input.propertyId)
  const to = input.to ?? hotel.businessDate
  const from = input.from ?? addDays(to, -6)
  const where = and(
    eq(cashierShifts.organizationId, access.organizationId),
    eq(cashierShifts.propertyId, hotel.id),
    readsAll(access) ? undefined : eq(cashierShifts.memberId, access.memberId),
    gte(cashierShifts.businessDate, from),
    lte(cashierShifts.businessDate, to),
    segmentWhere(input.segment),
  )
  // The naira cash line's difference, for "short" / "over"; only for shifts already counted.
  const cashDifference = sql<string | null>`(
    select ${cashierShiftCountLines.differenceNgn} from ${cashierShiftCountLines}
    where ${cashierShiftCountLines.shiftId} = ${cashierShifts.id}
      and ${cashierShiftCountLines.kind} = 'cash' and ${cashierShiftCountLines.currency} = 'NGN'
      and ${cashierShifts.status} <> 'open'
  )`
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: cashierShifts.id,
        number: cashierShifts.number,
        businessDate: cashierShifts.businessDate,
        drawerName: cashDrawers.name,
        memberName: cashierShifts.memberName,
        status: cashierShifts.status,
        openedAt: cashierShifts.openedAt,
        closedAt: cashierShifts.closedAt,
        openingFloat: cashierShifts.openingFloat,
        handoverDifference: cashierShifts.handoverDifference,
        totalDifference: cashierShifts.totalDifference,
        cashDifference,
        closeApprover: approvals.approverName,
        handoverApprovalId: cashierShifts.handoverApprovalId,
      })
      .from(cashierShifts)
      .innerJoin(cashDrawers, eq(cashDrawers.id, cashierShifts.drawerId))
      .leftJoin(approvals, eq(approvals.id, cashierShifts.closeApprovalId))
      .where(where)
      .orderBy(desc(cashierShifts.openedAt), desc(cashierShifts.id))
      .limit(input.pageSize)
      .offset(pageOffset(input)),
    db.select({ value: count() }).from(cashierShifts).where(where),
  ])
  const handoverApprovers = new Map<string, string>()
  const handoverIds = rows.flatMap((r) => (r.handoverApprovalId ? [r.handoverApprovalId] : []))
  if (handoverIds.length > 0) {
    const found = await db
      .select({ id: approvals.id, name: approvals.approverName })
      .from(approvals)
      .where(inArray(approvals.id, handoverIds))
    for (const a of found) if (a.name) handoverApprovers.set(a.id, a.name)
  }
  return toPage(
    rows.map((row) => {
      const counted = row.status !== 'open'
      return {
        id: row.id,
        number: row.number,
        businessDate: row.businessDate,
        drawerName: row.drawerName,
        memberName: row.memberName,
        status: row.status,
        openedAt: row.openedAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
        openingFloat: row.openingFloat,
        handoverDifference: row.handoverDifference,
        totalDifference: counted ? row.totalDifference : null,
        cashDifference: counted ? (row.cashDifference ?? null) : null,
        approvedBy:
          row.closeApprover ??
          (row.handoverApprovalId ? (handoverApprovers.get(row.handoverApprovalId) ?? null) : null),
        timeZone: hotel.timeZone,
      }
    }),
    total?.value ?? 0,
    input,
  )
}

export async function getShift(
  db: Reader,
  access: Access,
  input: { id: string },
): Promise<ShiftDetail> {
  requireShiftReader(access)
  const row = await findShift(db, access, input.id)
  // Someone else's shift, to a reader without `leakage.view`, looks like an unknown one.
  if (!readsAll(access) && row.memberId !== access.memberId) throw shiftNotFound()
  const hotel = await cashHotel(db, access, row.propertyId)
  const own = row.memberId === access.memberId
  const shift = await toShiftView(db, row, {
    timeZone: hotel.timeZone,
    limit: own ? varianceLimit(access) : null,
  })
  const approvalIds = [row.handoverApprovalId, row.closeApprovalId].filter((id): id is string =>
    Boolean(id),
  )
  const events = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorName: auditEvents.actorName,
      deviceName: devices.name,
      at: auditEvents.createdAt,
      reason: auditEvents.reason,
    })
    .from(auditEvents)
    .leftJoin(devices, eq(devices.id, auditEvents.deviceId))
    .where(
      and(
        eq(auditEvents.organizationId, access.organizationId),
        or(
          and(eq(auditEvents.entityType, 'cashier_shift'), eq(auditEvents.entityId, row.id)),
          approvalIds.length > 0
            ? and(
                eq(auditEvents.entityType, 'approval'),
                inArray(auditEvents.entityId, approvalIds),
              )
            : undefined,
        ),
      ),
    )
    .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id))
    .limit(50)
  return {
    shift,
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      actorName: event.actorName,
      deviceName: event.deviceName,
      at: event.at.toISOString(),
      reason: event.reason,
    })),
  }
}
