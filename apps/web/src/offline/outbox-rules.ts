// The outbox's rules, kept apart so they're tested without a browser (outbox.ts).
import type { SetRoomStatusInput } from '@vento/shared'

export type RoomStatusCommand = {
  kind: 'rooms.setStatus'
  input: SetRoomStatusInput & { idempotencyKey: string; occurredAt: string }
  memberId: string
  // For the sync queue: "502 marked dirty".
  label: string
}

// Waiting to send, or sent and answered with something a person should read.
export type Queued = RoomStatusCommand & { state: 'waiting' | 'attention'; message?: string }

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
      ? { ...item, state: 'attention' as const, message: answer.message }
      : item,
  )
}
