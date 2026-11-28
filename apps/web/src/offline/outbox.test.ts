import { describe, expect, it } from 'vitest'
import { afterAnswer, failureOf, nextToSend, type Queued } from './outbox-rules'

const command = (key: string, memberId: string): Queued => ({
  kind: 'rooms.setStatus',
  state: 'waiting',
  memberId,
  label: `${key} marked dirty`,
  input: {
    idempotencyKey: key,
    propertyId: 'p',
    roomId: key,
    status: 'dirty',
    occurredAt: '2026-11-25T10:00:00.000Z',
  },
})

describe('outbox', () => {
  it('sends the oldest command of the person signed in, never someone else’s', () => {
    const list = [command('a', 'grace'), command('b', 'chiamaka'), command('c', 'chiamaka')]
    expect(nextToSend(list, 'chiamaka')?.input.idempotencyKey).toBe('b')
    expect(nextToSend(list, 'tunde')).toBeUndefined()
  })

  it('drops applied commands and keeps superseded ones for a person to read', () => {
    const list = [command('a', 'grace'), command('b', 'grace')]
    const applied = afterAnswer(list, 'a', { outcome: 'applied' })
    expect(applied.map((item) => item.input.idempotencyKey)).toEqual(['b'])
    const kept = afterAnswer(applied, 'b', { outcome: 'attention', message: 'Kept as dirty.' })
    expect(kept[0]).toMatchObject({ state: 'attention', message: 'Kept as dirty.' })
    expect(nextToSend(kept, 'grace')).toBeUndefined()
  })

  it('keeps a command waiting when the session ended or the connection dropped', () => {
    expect(failureOf({ status: 401, code: 'UNAUTHORIZED' }, false)).toBe('signed_out')
    expect(failureOf({ code: 'UNAUTHORIZED' }, false)).toBe('signed_out')
    expect(failureOf({ status: 0 }, true)).toBe('offline')
    expect(failureOf({ status: 409, code: 'CONFLICT' }, false)).toBe('refused')
  })
})
