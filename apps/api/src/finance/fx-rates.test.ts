// FX rates through the real HTTP flow (spec: stage-1-taxes-and-payment-methods.md, "FX rates").
import { addDays, calendarDateIn, type FxRateView, type FxSummary } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fxRates } from '../db/schema/finance.ts'
import { createTestApp } from '../test/harness.ts'
import {
  events,
  type KoraFinance,
  koraFinance,
  type Page,
  type Problem,
  setHotel,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL
const today = calendarDateIn('Africa/Lagos')
const yesterday = addDays(today, -1)

describe.skipIf(!url)('FX rates', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraFinance

  const enter = (cookie: string, input: Record<string, unknown>) =>
    t.rpc<{ saved: number } & Problem>(cookie, 'fxRates/enter', input)

  beforeAll(async () => {
    k = await koraFinance(t)
    const first = await enter(k.finance.cookie, {
      rateDate: yesterday,
      rates: [
        { currency: 'USD', rate: '1,620.00' },
        { currency: 'GBP', rate: '1950' },
      ],
    })
    expect(first.data.saved).toBe(2)
  })

  it('lets the GM enter today’s rate and shows it as the latest, with who entered it', async () => {
    const saved = await enter(k.gm.cookie, {
      rateDate: today,
      rates: [{ currency: 'USD', rate: '1625' }],
    })
    expect(saved.status).toBe(200)
    const summary = (await t.rpc<FxSummary>(k.gm.cookie, 'fxRates/summary')).data
    const usd = summary.currencies.find((c) => c.currency === 'USD')
    expect(usd?.latest).toMatchObject({
      rateDate: today,
      rate: '1625',
      enteredByName: 'Tunde Bello',
    })
    expect(usd?.recent.map((r) => r.rate)).toEqual(['1620', '1625'])
    const [event] = await events(t, k.owner, { entityType: 'fx_rate' })
    expect(event).toMatchObject({
      action: 'fx_rate.entered',
      after: { currency: 'USD', rate: '1625', source: 'cbn' },
    })
  })

  it('asks to check a rate far from the last one, and saves it when confirmed', async () => {
    const typo = await enter(k.finance.cookie, {
      rateDate: today,
      rates: [{ currency: 'GBP', rate: '19500' }],
    })
    expect(typo.data).toMatchObject({
      message: `₦19,500.00 is 10 times the last GBP rate (₦1,950.00 on ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${yesterday}T00:00:00Z`))}). Check the figure.`,
      data: { code: 'FX_RATE_CHECK' },
    })
    // A confirmation covers only the value confirmed: changing the figure checks again.
    const swapped = await enter(k.finance.cookie, {
      rateDate: today,
      rates: [{ currency: 'GBP', rate: '99999' }],
      confirmed: [{ currency: 'GBP', rate: '19500' }],
    })
    expect(swapped.data.data?.code).toBe('FX_RATE_CHECK')
    const anyway = await enter(k.finance.cookie, {
      rateDate: today,
      rates: [{ currency: 'GBP', rate: '1990' }],
      confirmed: [{ currency: 'GBP', rate: '1,990.00' }],
    })
    expect(anyway.status).toBe(200)
  })

  it('replaces a rate already entered only with a reason, keeping the old one superseded', async () => {
    const exists = await enter(k.finance.cookie, {
      rateDate: today,
      rates: [{ currency: 'USD', rate: '1630' }],
    })
    expect(exists.data.data?.code).toBe('FX_RATE_EXISTS')
    expect(exists.data.message).toMatch(
      /^USD for .* is already ₦1,625\.00 \(Tunde Bello, \d\d:\d\d\)\. Replace it\? Payments already taken keep the rate they used\.$/,
    )
    const replaced = await enter(k.finance.cookie, {
      rateDate: today,
      rates: [{ currency: 'USD', rate: '1630' }],
      replaceReason: 'Typed the morning rate',
    })
    expect(replaced.status).toBe(200)
    const history = await t.rpc<Page<FxRateView>>(k.finance.cookie, 'fxRates/list', {
      currency: 'USD',
    })
    expect(history.data.items.map((r) => [r.rate, r.superseded])).toEqual([
      ['1630', false],
      ['1625', true],
      ['1620', false],
    ])
    const [event] = await events(t, k.owner, { entityType: 'fx_rate' })
    expect(event).toMatchObject({
      action: 'fx_rate.replaced',
      reason: 'Typed the morning rate',
      before: { rate: '1625' },
    })
  })

  it('refuses future dates and people without fx.enter', async () => {
    const future = await enter(k.finance.cookie, {
      rateDate: addDays(today, 1),
      rates: [{ currency: 'EUR', rate: '1870' }],
    })
    expect(future.data.message).toBe("Rates can't be entered for future dates.")
    const desk = await enter(k.frontDesk.cookie, {
      rateDate: today,
      rates: [{ currency: 'EUR', rate: '1870' }],
    })
    expect(desk.data.message).toBe('Only a GM, finance or the owner can enter FX rates.')
  })

  it('gives a hotel the latest rate on or before its business date, with its age', async () => {
    await setHotel(t, k.vi.id, { businessDate: yesterday })
    const rate = await t.rpc(k.gm.cookie, 'fxRates/forHotel', {
      propertyId: k.vi.id,
      currency: 'USD',
    })
    expect(rate.data).toEqual({
      currency: 'USD',
      rate: '1620',
      source: 'cbn',
      date: yesterday,
      ageDays: 0,
    })
    const none = await t.rpc(k.gm.cookie, 'fxRates/forHotel', {
      propertyId: k.vi.id,
      currency: 'EUR',
    })
    expect(none.data).toBeNull()
    await setHotel(t, k.vi.id, { businessDate: today })
  })

  it('keeps each group’s rates to itself', async () => {
    const theirs = (await t.rpc<FxSummary>(k.other.cookie, 'fxRates/summary')).data
    expect(theirs.currencies.every((c) => c.latest === null)).toBe(true)
  })

  it('never lets a rate be deleted or changed, even by hand', async () => {
    const [row] = await t.db.select({ id: fxRates.id }).from(fxRates).limit(1)
    await expect(t.db.delete(fxRates).where(eq(fxRates.id, row?.id ?? ''))).rejects.toMatchObject({
      cause: { code: '23001' },
    })
    await expect(
      t.db
        .update(fxRates)
        .set({ rate: '1' })
        .where(eq(fxRates.id, row?.id ?? '')),
    ).rejects.toMatchObject({ cause: { code: '23001' } })
  })
})
