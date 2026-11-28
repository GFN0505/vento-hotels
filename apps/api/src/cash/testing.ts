// Test fixtures for cashier shifts: Kora as the finance fixtures leave it (Kora Victoria Island,
// Kora Ikeja GRA and Kora Port Harcourt, each with Desk 1 from hotel creation), plus at Victoria
// Island: a Zenith account, Moniepoint · Desk 1 at Desk 1, Ibrahim (front desk), Halima (cashier),
// Emeka (waiter) and Grace (housekeeping); PINs for Tunde, the owner and Chiamaka; FD-VI-01
// registered as this test's shared device. Victoria Island goes live at the end, so differences
// carry `liveProperty: true`.
import {
  type BankAccountView,
  type DeviceView,
  type DrawerView,
  EMPTY_COUNT,
  type MyShift,
  type NoteCount,
  newId,
  type PosTerminalView,
  type ShiftView,
} from '@vento/shared'
import { eq } from 'drizzle-orm'
import { approvals } from '../db/schema/approvals.ts'
import { koraFinance, setHotel } from '../finance/testing.ts'
import { limitTo, type Person, person } from '../tenancy/testing.ts'
import { type createTestApp, PASSWORD } from '../test/harness.ts'

type TestApp = ReturnType<typeof createTestApp>

export const PINS = { tunde: '5072', owner: '8391', chiamaka: '2948', kunle: '2671' } as const

export async function koraCash(t: TestApp) {
  const k = await koraFinance(t)
  const zenith = (
    await t.rpc<BankAccountView>(k.finance.cookie, 'bankAccounts/create', {
      propertyId: k.vi.id,
      bankName: 'Zenith Bank',
      accountNumber: '0123454471',
      accountName: 'Kora Hospitality Ltd',
      currency: 'NGN',
      guestTransfer: true,
    })
  ).data
  const terminal = (
    await t.rpc<PosTerminalView>(k.finance.cookie, 'posTerminals/create', {
      propertyId: k.vi.id,
      provider: 'Moniepoint',
      name: 'Desk 1',
      terminalId: `2MPT${newId()
        .slice(-4)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '0')}`,
      bankAccountId: zenith.id,
    })
  ).data
  const drawers = await t.rpc<{ items: DrawerView[] }>(k.finance.cookie, 'cash/drawers/list', {
    propertyId: k.vi.id,
  })
  const desk1Row = drawers.data.items[0]
  if (!desk1Row) throw new Error('Kora Victoria Island has no Desk 1')
  const desk1 = (
    await t.rpc<DrawerView>(k.finance.cookie, 'cash/drawers/update', {
      propertyId: k.vi.id,
      id: desk1Row.id,
      version: desk1Row.version,
      name: 'Desk 1',
      posTerminalIds: [terminal.id],
    })
  ).data
  const desk2 = (
    await t.rpc<DrawerView>(k.finance.cookie, 'cash/drawers/create', {
      propertyId: k.vi.id,
      name: 'Desk 2',
      posTerminalIds: [terminal.id],
    })
  ).data
  const ibrahim = await person(t, k.orgId, 'Ibrahim Musa', 'front_desk')
  await limitTo(t, k.owner, ibrahim, [k.vi.id])
  const halima = await person(t, k.orgId, 'Halima Yusuf', 'cashier')
  await limitTo(t, k.owner, halima, [k.vi.id])
  const waiter = await person(t, k.orgId, 'Emeka Nwosu', 'waiter')
  await limitTo(t, k.owner, waiter, [k.vi.id])
  for (const [who, pin] of [
    [k.gm, PINS.tunde],
    [k.owner, PINS.owner],
    [k.frontDesk, PINS.chiamaka],
    [k.finance, PINS.kunle],
  ] as const) {
    const set = await t.rpc<{ message?: string }>(who.cookie, 'pins/set', {
      pin,
      password: PASSWORD,
    })
    if (set.status !== 200) throw new Error(`pin failed: ${set.data.message}`)
  }
  const registered = await t.call('/rpc/devices/register', {
    cookie: k.owner.cookie,
    body: { json: { name: 'FD-VI-01', kind: 'front_desk', propertyId: k.vi.id } },
  })
  const device = ((await registered.json()) as { json: DeviceView }).json
  const deviceCookie =
    registered.headers
      .getSetCookie()
      .find((c) => c.startsWith('vento_device='))
      ?.split(';')[0] ?? ''
  await setHotel(t, k.vi.id, { businessDate: '2026-11-25', liveSince: '2026-11-16' })
  return { ...k, zenith, terminal, desk1, desk2, ibrahim, halima, waiter, device, deviceCookie }
}

export type KoraCash = Awaited<ReturnType<typeof koraCash>>

export const at = (who: Person, deviceCookie?: string) =>
  deviceCookie ? `${who.cookie}; ${deviceCookie}` : who.cookie

// ₦1,000 × n and nothing else.
export const thousands = (n: number): NoteCount => ({ ...EMPTY_COUNT, '1000': n })

export async function myShift(t: TestApp, who: Person, propertyId: string) {
  return t.rpc<MyShift>(who.cookie, 'cash/myShift', { propertyId })
}

// Opens a shift on a drawer with the hand-over My shift shows.
export async function open(
  t: TestApp,
  who: Person,
  propertyId: string,
  drawerId: string,
  count: NoteCount,
  extra: { reason?: string; approvalId?: string; cookie?: string; id?: string; key?: string } = {},
) {
  const mine = await myShift(t, who, propertyId)
  const drawer = mine.data.drawers?.find((d) => d.id === drawerId)
  return t.rpc<ShiftView & { message?: string; data?: { code?: string } }>(
    extra.cookie ?? who.cookie,
    'cash/open',
    {
      idempotencyKey: extra.key ?? newId(),
      id: extra.id ?? newId(),
      propertyId,
      drawerId,
      count,
      handoverFromShiftId: drawer?.lastClose?.shiftId ?? null,
      ...(extra.reason ? { reason: extra.reason } : {}),
      ...(extra.approvalId ? { approvalId: extra.approvalId } : {}),
    },
  )
}

// The count of a Victoria Island shift: naira by note, POS and transfers as given.
export function countOf(
  shift: { id: string; version: number; terminals: { id: string }[] },
  cash: NoteCount,
  other: {
    pos?: string
    transfers?: string | null
    foreign?: { currency: string; amount: string }[]
  } = {},
) {
  return {
    idempotencyKey: newId(),
    shiftId: shift.id,
    version: shift.version,
    cash,
    foreign: other.foreign ?? [],
    pos: shift.terminals.map((terminal) => ({
      posTerminalId: terminal.id,
      amount: other.pos ?? '0',
    })),
    transfers: other.transfers === undefined ? '0' : other.transfers,
  }
}

export async function submit(t: TestApp, who: Person, body: ReturnType<typeof countOf>) {
  return t.rpc<ShiftView & { message?: string; data?: { code?: string } }>(
    who.cookie,
    'cash/submitCount',
    body,
  )
}

export async function close(
  t: TestApp,
  who: Person,
  shift: { id: string; version: number },
  extra: {
    floatKept: string
    reason?: string
    bagNumber?: string
    approvalId?: string
    key?: string
  },
) {
  return t.rpc<ShiftView & { message?: string; data?: { code?: string } }>(
    who.cookie,
    'cash/close',
    {
      idempotencyKey: extra.key ?? newId(),
      shiftId: shift.id,
      version: shift.version,
      floatKept: extra.floatKept,
      ...(extra.reason ? { reason: extra.reason } : {}),
      ...(extra.bagNumber ? { bagNumber: extra.bagNumber } : {}),
      ...(extra.approvalId ? { approvalId: extra.approvalId } : {}),
    },
  )
}

export async function approvalRow(t: TestApp, id: string) {
  const [row] = await t.db.select().from(approvals).where(eq(approvals.id, id))
  return row
}
