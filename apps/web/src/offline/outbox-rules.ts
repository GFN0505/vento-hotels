// The outbox's rules, kept apart so they're tested without a browser (outbox.ts).
import type { CheckInInput, SetRoomStatusInput } from '@vento/shared'

export type RoomStatusCommand = {
  kind: 'rooms.setStatus'
  input: SetRoomStatusInput & { idempotencyKey: string; occurredAt: string }
  memberId: string
  // For the sync queue: "502 marked dirty".
  label: string
}

// An offline check-in of an arrival already in a room (brick 8, decision 0009's allow-list). The
// registrations, the ID photo and the ID choice travel sealed (sealed.ts); the rest is plain.
export type CheckInCommand = {
  kind: 'stays.checkIn'
  input: Omit<CheckInInput, 'registrations' | 'idDocument'> & {
    idempotencyKey: string
    occurredAt: string
    propertyId: string
  }
  sealed: string
  memberId: string
  // "Daniel Mensah checked in to 502"
  label: string
  guestName: string
  roomNumber: string
}

export type Command = RoomStatusCommand | CheckInCommand

// Waiting to send, or sent and answered with something a person should read.
export type Queued = Command & { state: 'waiting' | 'attention'; message?: string }

// The next command this person can send: the oldest of theirs still waiting.
export function nextToSend(list: readonly Queued[], memberId: string | undefined) {
  return list.find((item) => item.state === 'waiting' && item.memberId === memberId)
}

// What a server answer does to the queue: applied ones leave it; superseded or refused ones stay
// for a person to read, never silently dropped.
export function afterAnswer(
  list: readonly Queued[],
  key: string,
  answer: { outcome: 'applied' } | { outcome: 'attention'; message: string },
): Queued[] {
  if (answer.outcome === 'applied') return list.filter((item) => item.input.idempotencyKey !== key)
  return list.map((item) =>
    item.input.idempotencyKey === key
      ? // A check-in that won't be sent again keeps no ID numbers or photo on the device.
        { ...withoutSecrets(item), state: 'attention' as const, message: answer.message }
      : item,
  )
}

const withoutSecrets = (item: Queued): Queued =>
  item.kind === 'stays.checkIn' ? { ...item, sealed: '' } : item

// When the device is removed or the person fully signs out (decision 0029), the sealed ID numbers
// and photos go with the key that opens them: a check-in still waiting can't be sent any more, so it
// stays for a person to read and do again, never silently dropped. Room status changes are kept.
export function forgetSealed(list: readonly Queued[]): Queued[] {
  return list.map((item) =>
    item.kind !== 'stays.checkIn'
      ? item
      : {
          ...withoutSecrets(item),
          state: 'attention' as const,
          message:
            item.state === 'waiting' || !item.message
              ? `${item.guestName}'s check-in to ${item.roomNumber} didn't sync before signing out. Check them in again.`
              : item.message,
        },
  )
}

// What a failed send means for the queue: the connection dropped (wait for it), the session ended
// (a device locked, a sign-in expired: wait for the person to sign in again), or the server refused
// the command (a person reads why). Only the last leaves the waiting list.
export function failureOf(
  error: unknown,
  connectionProblem: boolean,
): 'offline' | 'signed_out' | 'refused' {
  if (connectionProblem) return 'offline'
  const failure = error as { status?: number; code?: string } | null
  if (failure?.status === 401 || failure?.code === 'UNAUTHORIZED') return 'signed_out'
  return 'refused'
}
