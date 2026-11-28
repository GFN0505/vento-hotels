import { describe, expect, it } from 'vitest'
import { afterAnswer, failureOf, forgetSealed, nextToSend, type Queued } from './outbox-rules'

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

const checkIn = (key: string, state: Queued['state'] = 'waiting'): Queued => ({
  kind: 'stays.checkIn',
  state,
  memberId: 'chiamaka',
  label: `Daniel Mensah checked in to 502`,
  guestName: 'Daniel Mensah',
  roomNumber: '502',
  sealed: 'iv.sealed-id-numbers-and-photo',
  input: {
    idempotencyKey: key,
    stayId: 's',
    version: 1,
    roomId: 'r',
    printCard: false,
    occurredAt: '2026-11-25T10:00:00.000Z',
    businessDate: '2026-11-25',
    durationSeconds: 90,
    source: 'offline',
    propertyId: 'p',
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

  it('blanks a check-in’s sealed ID numbers and photo once it needs attention', () => {
    const kept = afterAnswer([checkIn('a'), checkIn('b')], 'a', {
      outcome: 'attention',
      message: 'Room taken.',
    })
    expect(kept[0]).toMatchObject({ state: 'attention', sealed: '', message: 'Room taken.' })
    expect(kept[1]).toMatchObject({ state: 'waiting', sealed: 'iv.sealed-id-numbers-and-photo' })
  })

  it('forgets every sealed check-in on revoke or sign-out, keeping each for a person to read', () => {
    const list = [command('a', 'grace'), checkIn('b'), checkIn('c', 'attention')]
    const after = forgetSealed(list)
    expect(after[0]).toEqual(list[0])
    expect(after[1]).toMatchObject({ state: 'attention', sealed: '' })
    expect(after[1]?.message).toContain("Daniel Mensah's check-in to 502 didn't sync")
    expect(after[2]).toMatchObject({ state: 'attention', sealed: '' })
    expect(nextToSend(after, 'chiamaka')).toBeUndefined()
  })
})
