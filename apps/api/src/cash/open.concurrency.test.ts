// The concurrent-open race (spec: "At most one unclosed shift per drawer and per person, even when
// two people press Open at the same moment"): two people on one drawer, and one person on two
// drawers, opening at once; exactly one wins every time. Kept to a modest number of rounds so the
// suite stays quick; each round is a real race over separate connections.
import { type DrawerView, newId, type ShiftView } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Person } from '../tenancy/testing.ts'
import { createTestApp } from '../test/harness.ts'
import { close, countOf, type KoraCash, koraCash, submit, thousands } from './testing.ts'

const url = process.env.TEST_DATABASE_URL
const ROUNDS = 12

type Answer = { status: number; data: ShiftView & { data?: { code?: string } } }

describe.skipIf(!url)('opening a shift at the same moment', () => {
  const t = createTestApp(url ?? '', { max: 8 })
  afterAll(() => t.close())
  let k: KoraCash

  beforeAll(async () => {
    k = await koraCash(t)
  }, 60_000)

  const drawer = async (name: string) =>
    (
      await t.rpc<DrawerView>(k.finance.cookie, 'cash/drawers/create', {
        propertyId: k.vi.id,
        name,
        posTerminalIds: [],
        reason: 'Race test',
      })
    ).data

  const openOn = (who: Person, drawerId: string) =>
    t.rpc(who.cookie, 'cash/open', {
      idempotencyKey: newId(),
      id: newId(),
      propertyId: k.vi.id,
      drawerId,
      count: thousands(0),
      handoverFromShiftId: null,
    }) as Promise<Answer>

  const closeWinner = async (who: Person, shift: ShiftView) => {
    const counted = await submit(t, who, countOf(shift, thousands(0)))
    if (counted.data.status !== 'counted') throw new Error(counted.data.message)
    await close(t, who, counted.data, { floatKept: '0' })
  }

  it('lets one of two people open the same drawer', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const desk = await drawer(`Race A${round}`)
      const answers = await Promise.all([openOn(k.frontDesk, desk.id), openOn(k.ibrahim, desk.id)])
      const won = answers.filter((a) => a.status === 200)
      expect(won).toHaveLength(1)
      const lost = answers.find((a) => a.status !== 200)
      expect(lost?.data.data?.code).toBe('DRAWER_BUSY')
      const winner = won[0]
      if (!winner) throw new Error('no winner')
      await closeWinner(
        winner.data.member.memberId === k.frontDesk.memberId ? k.frontDesk : k.ibrahim,
        winner.data,
      )
    }
  }, 120_000)

  it('lets one person open only one of two drawers', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const [one, two] = [await drawer(`Race B${round}`), await drawer(`Race C${round}`)]
      const answers = await Promise.all([openOn(k.halima, one.id), openOn(k.halima, two.id)])
      const won = answers.filter((a) => a.status === 200)
      expect(won).toHaveLength(1)
      expect(answers.find((a) => a.status !== 200)?.data.data?.code).toBe('SHIFT_ALREADY_OPEN')
      const winner = won[0]
      if (!winner) throw new Error('no winner')
      await closeWinner(k.halima, winner.data)
    }
  }, 120_000)
})
