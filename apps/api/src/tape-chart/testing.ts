// Test helpers for the tape chart, room moves, room status and out of order: drive the procedures as
// the chart and its dialogs do.
import type {
  AssignedRoom,
  ChartRoom,
  OutOfOrderCheck,
  OutOfOrderView,
  RoomStatusResult,
  TapeChart,
} from '@vento/shared'
import { newId } from '@vento/shared'
import { type Result, rpc } from '../reservations/change/testing.ts'
import type { createTestApp } from '../test/harness.ts'

type TestApp = ReturnType<typeof createTestApp>

export async function chartOf(
  t: TestApp,
  cookie: string,
  propertyId: string,
  extra: { from?: string; days?: number } = {},
) {
  return rpc<TapeChart>(t, cookie, 'tapeChart/get', { propertyId, days: 30, ...extra })
}

// The hotel's rooms of a type, by number, from the chart.
export async function roomsOf(
  t: TestApp,
  cookie: string,
  propertyId: string,
  roomTypeId: string,
): Promise<ChartRoom[]> {
  const chart = await chartOf(t, cookie, propertyId)
  if (chart.status !== 200) throw new Error(`chart failed: ${chart.data.message}`)
  return chart.data.rooms.filter((room) => room.roomTypeId === roomTypeId)
}

export const assign = (
  t: TestApp,
  cookie: string,
  stay: { id: string; version: number },
  roomId: string | null,
  extra: Record<string, unknown> = {},
) =>
  rpc<AssignedRoom>(t, cookie, 'stays/assignRoom', {
    idempotencyKey: newId(),
    stayId: stay.id,
    version: stay.version,
    roomId,
    ...extra,
  })

export const setStatus = (
  t: TestApp,
  cookie: string,
  propertyId: string,
  roomId: string,
  status: 'clean' | 'dirty',
  extra: Record<string, unknown> = {},
) =>
  rpc<RoomStatusResult>(t, cookie, 'rooms/setStatus', {
    idempotencyKey: newId(),
    propertyId,
    roomId,
    status,
    occurredAt: new Date().toISOString(),
    ...extra,
  })

export const outOfOrder = (
  t: TestApp,
  cookie: string,
  ask: { propertyId: string; roomId: string; from: string; backInService: string },
  extra: Record<string, unknown> = {},
): Promise<Result<OutOfOrderView>> =>
  rpc<OutOfOrderView>(t, cookie, 'rooms/outOfOrder/create', {
    idempotencyKey: newId(),
    reason: 'ac',
    ...ask,
    ...extra,
  })

export const checkOutOfOrder = (
  t: TestApp,
  cookie: string,
  ask: {
    propertyId: string
    roomId: string
    from: string
    backInService: string
    periodId?: string
  },
) => rpc<OutOfOrderCheck>(t, cookie, 'rooms/outOfOrder/check', ask)
