// Test fixtures for approvals: Kora as the reservations fixtures leave it (Chiamaka at the front
// desk with a 12% limit, Sade 25% at Victoria Island and Ikeja, Tunde 50% at Victoria Island, the
// owner with any), with the demo PINs set and FD-VI-01 registered as this test's shared device.
import type { CreateReservationInput, DeviceView } from '@vento/shared'
import { newId } from '@vento/shared'
import { and, desc, eq } from 'drizzle-orm'
import { auditEvents } from '../db/schema/governance.ts'
import { memberPins } from '../db/schema/tenancy.ts'
import { COLLINS, koraBooking, quote } from '../reservations/testing.ts'
import type { Person } from '../tenancy/testing.ts'
import { type createTestApp, PASSWORD } from '../test/harness.ts'

type TestApp = ReturnType<typeof createTestApp>

export const PINS = { tunde: '5072', owner: '8391', sade: '6294', chiamaka: '2948' } as const

export async function koraApprovals(t: TestApp) {
  const k = await koraBooking(t)
  for (const [who, pin] of [
    [k.gm, PINS.tunde],
    [k.owner, PINS.owner],
    [k.sade, PINS.sade],
    [k.frontDesk, PINS.chiamaka],
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
  return { ...k, device, deviceCookie }
}

export type KoraApprovals = Awaited<ReturnType<typeof koraApprovals>>

export const at = (person: Person, deviceCookie?: string) =>
  deviceCookie ? `${person.cookie}; ${deviceCookie}` : person.cookie

// The booking Review & book would send: Deluxe King, Bed & breakfast, 1 adult, with the discount.
export async function draftFor(
  t: TestApp,
  k: KoraApprovals,
  person: Person,
  arrival: string,
  departure: string,
  percent = '15',
): Promise<CreateReservationInput> {
  const discount = {
    kind: 'percent',
    value: percent,
    reason: 'repeat_guest',
    note: 'Stayed 4 times',
  }
  const stay = { roomTypeId: k.types.dlk.id, ratePlanId: k.bb.id, arrival, departure, discount }
  const quoted = await quote(t, person.cookie, k.vi.id, stay)
  if (quoted.status !== 200) throw new Error(`quote failed: ${quoted.data.message}`)
  return {
    idempotencyKey: newId(),
    propertyId: k.vi.id,
    guest: COLLINS,
    source: 'phone',
    stays: [
      {
        ...stay,
        discount: {
          kind: 'percent',
          value: percent,
          reason: 'repeat_guest',
          note: 'Stayed 4 times',
        },
        adults: 1,
        children: 0,
        quoteHash: quoted.data.quoteHash,
      },
    ],
  }
}

export const withApproval = (booking: CreateReservationInput, approvalId: string) => ({
  ...booking,
  stays: booking.stays.map((stay) => ({ ...stay, approvalId })),
})

export async function auditFor(
  t: TestApp,
  organizationId: string,
  action: string,
  entityId?: string,
) {
  return t.db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        eq(auditEvents.action, action),
        entityId ? eq(auditEvents.entityId, entityId) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
}

export async function clearPin(t: TestApp, memberId: string) {
  await t.db
    .update(memberPins)
    .set({ failedAttempts: 0, lockedUntil: null, lockCount: 0 })
    .where(eq(memberPins.memberId, memberId))
}
