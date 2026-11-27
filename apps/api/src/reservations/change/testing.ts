// Test helpers for modify, cancel and no-show: drive the procedures as the dialogs do (quote first,
// then save with the hash and version shown).
import type { ChangeQuote, EndQuote, ReservationDetail } from '@vento/shared'
import { newId } from '@vento/shared'
import type { createTestApp } from '../../test/harness.ts'
import { book, type Problem, type StayAsk } from '../testing.ts'

type TestApp = ReturnType<typeof createTestApp>
export type Result<T> = { status: number; data: T & Problem & { data?: Record<string, unknown> } }

export const rpc = <T>(t: TestApp, cookie: string, path: string, input: unknown) =>
  t.rpc(cookie, path, input) as Promise<Result<T>>

export async function detailOf(t: TestApp, cookie: string, id: string) {
  const result = await rpc<ReservationDetail>(t, cookie, 'reservations/get', { id })
  if (result.status !== 200) throw new Error(`detail failed: ${result.data.message}`)
  return result.data
}

// Books one stay and returns what a change needs: ids and the stay as stored.
export async function bookStay(
  t: TestApp,
  cookie: string,
  propertyId: string,
  stay: StayAsk,
  extra: Record<string, unknown> = {},
) {
  const made = await book(t, cookie, propertyId, [stay], extra)
  if (made.status !== 200) throw new Error(`booking failed: ${JSON.stringify(made.data)}`)
  const detail = await detailOf(t, cookie, made.data.id)
  const first = detail.stays[0]
  if (!first) throw new Error('no stay')
  return { id: made.data.id, number: made.data.number, stay: first, detail }
}

export type Booked = Awaited<ReturnType<typeof bookStay>>

export const fieldsOf = (booked: Booked, patch: Record<string, unknown> = {}) => ({
  reservationId: booked.id,
  stayId: booked.stay.id,
  version: booked.stay.version,
  arrival: booked.stay.arrival,
  departure: booked.stay.departure,
  roomTypeId: booked.stay.roomTypeId,
  adults: booked.stay.adults,
  children: booked.stay.children,
  ...patch,
})

export const quoteChange = (t: TestApp, cookie: string, fields: Record<string, unknown>) =>
  rpc<ChangeQuote>(t, cookie, 'reservations/quoteChange', fields)

// Quotes the change, then saves it with the quoted hash.
export async function modify(
  t: TestApp,
  cookie: string,
  fields: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  const quoted = await quoteChange(t, cookie, fields)
  return rpc<{ id: string; status: string; penalties: { id: string; status: string }[] }>(
    t,
    cookie,
    'reservations/modify',
    {
      idempotencyKey: newId(),
      ...fields,
      changeHash: quoted.status === 200 ? quoted.data.changeHash : 'unquoted',
      ...extra,
    },
  )
}

export const endQuote = (t: TestApp, cookie: string, id: string, mode: 'cancel' | 'no_show') =>
  rpc<EndQuote>(t, cookie, 'reservations/endQuote', { reservationId: id, mode })

export type Ended = {
  id: string
  status: string
  penalties: { id: string; amount: string; status: string }[]
}

export async function cancel(
  t: TestApp,
  cookie: string,
  id: string,
  extra: Record<string, unknown> = {},
) {
  const quoted = await endQuote(t, cookie, id, 'cancel')
  return rpc<Ended>(t, cookie, 'reservations/cancel', {
    idempotencyKey: newId(),
    reservationId: id,
    version: quoted.data.version,
    reason: 'guest_request',
    ...extra,
  })
}

export async function noShow(
  t: TestApp,
  cookie: string,
  id: string,
  extra: Record<string, unknown> = {},
) {
  const quoted = await endQuote(t, cookie, id, 'no_show')
  return rpc<Ended>(t, cookie, 'reservations/markNoShow', {
    idempotencyKey: newId(),
    reservationId: id,
    version: quoted.data.version,
    ...extra,
  })
}
