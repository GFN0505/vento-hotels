// FX rates, group-wide: naira per unit of USD, GBP and EUR for a rate date, typed daily from the
// CBN page by a GM or finance (decision 4). A replaced rate is kept, superseded; payments already
// taken keep the rate stored on them (brick 10). A hotel uses the latest CBN rate dated on or
// before its business date.
import { ORPCError } from '@orpc/server'
import {
  addDays,
  dec,
  FX_CURRENCIES,
  type FxCurrency,
  type FxSummary,
  fxCheckMessage,
  fxRateJump,
  newId,
  nightsBetween,
  type PageQuery,
  pageOffset,
  toAmount,
  toPage,
} from '@vento/shared'
import { and, asc, count, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { fxRates } from '../db/schema/finance.ts'
import { type Access, can, requireFeature } from '../tenancy/access.ts'
import {
  clockIn,
  dateLabel,
  FX_ONLY,
  loadHotel,
  lockKey,
  type Reader,
  requirePaymentsRead,
  today,
} from './context.ts'
import { noPermission } from './errors.ts'

const naira = (rate: string) => {
  const [whole = '0', fraction = '00'] = toAmount(rate).split('.')
  return `₦${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
}

const live = (organizationId: string, currency: FxCurrency) =>
  and(
    eq(fxRates.organizationId, organizationId),
    eq(fxRates.currency, currency),
    eq(fxRates.source, 'cbn'),
    isNull(fxRates.supersededAt),
  )

// The rate a hotel uses on a business date, with its date and age, or null when there is none.
export async function fxRateFor(
  db: Reader,
  organizationId: string,
  currency: FxCurrency,
  businessDate: string,
) {
  const [row] = await db
    .select({ rate: fxRates.rate, rateDate: fxRates.rateDate, source: fxRates.source })
    .from(fxRates)
    .where(and(live(organizationId, currency), lte(fxRates.rateDate, businessDate)))
    .orderBy(desc(fxRates.rateDate))
    .limit(1)
  if (!row) return null
  return {
    currency,
    rate: dec(row.rate).toString(),
    source: row.source,
    date: row.rateDate,
    ageDays: nightsBetween(row.rateDate, businessDate),
  }
}

export async function fxRateForHotel(
  db: Reader,
  access: Access,
  input: { propertyId: string; currency: FxCurrency },
) {
  requirePaymentsRead(access)
  const hotel = await loadHotel(db, access, input.propertyId)
  return fxRateFor(db, access.organizationId, input.currency, hotel.businessDate)
}

export async function fxSummary(db: Reader, access: Access): Promise<FxSummary> {
  requirePaymentsRead(access)
  const day = today()
  const from = addDays(day, -29)
  const currencies = await Promise.all(
    FX_CURRENCIES.map(async (currency) => {
      const [latest] = await db
        .select()
        .from(fxRates)
        .where(and(live(access.organizationId, currency), lte(fxRates.rateDate, day)))
        .orderBy(desc(fxRates.rateDate))
        .limit(1)
      const recent = await db
        .select({ rateDate: fxRates.rateDate, rate: fxRates.rate })
        .from(fxRates)
        .where(
          and(
            live(access.organizationId, currency),
            gte(fxRates.rateDate, from),
            lte(fxRates.rateDate, day),
          ),
        )
        .orderBy(asc(fxRates.rateDate))
      return {
        currency,
        latest: latest
          ? {
              rateDate: latest.rateDate,
              rate: dec(latest.rate).toString(),
              enteredByName: latest.enteredByName,
              at: latest.createdAt.toISOString(),
            }
          : null,
        recent: recent.map((row) => ({ rateDate: row.rateDate, rate: dec(row.rate).toString() })),
      }
    }),
  )
  return { today: day, canEnter: can(access, 'fx.enter'), currencies }
}

export async function listFxRates(
  db: Reader,
  access: Access,
  query: PageQuery & { currency?: FxCurrency | undefined },
) {
  requirePaymentsRead(access)
  const where = and(
    eq(fxRates.organizationId, access.organizationId),
    query.currency ? eq(fxRates.currency, query.currency) : undefined,
  )
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(fxRates)
      .where(where)
      .orderBy(desc(fxRates.rateDate), asc(fxRates.currency), desc(fxRates.createdAt))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(fxRates).where(where),
  ])
  return toPage(
    rows.map((row) => ({
      id: row.id,
      currency: row.currency as FxCurrency,
      rateDate: row.rateDate,
      rate: dec(row.rate).toString(),
      source: row.source,
      enteredByName: row.enteredByName,
      at: row.createdAt.toISOString(),
      superseded: row.supersededAt !== null,
      replaceReason: row.replaceReason,
    })),
    total?.value ?? 0,
    query,
  )
}

// Saves the day's rates. A rate more than 10% from the previous one asks to check it first
// (FX_RATE_CHECK, unless that exact rate is in `confirmed`); a rate already entered for the date is only replaced with a
// reason (FX_RATE_EXISTS), and the old one is kept, superseded.
export async function enterFxRates(
  db: Database,
  access: Access,
  input: {
    rateDate: string
    rates: { currency: FxCurrency; rate: string }[]
    confirmed: { currency: FxCurrency; rate: string }[]
    replaceReason?: string | undefined
  },
): Promise<{ saved: number }> {
  requireFeature(access, 'front_desk')
  if (!can(access, 'fx.enter')) throw noPermission(FX_ONLY)
  if (input.rateDate > today()) {
    throw new ORPCError('BAD_REQUEST', {
      message: "Rates can't be entered for future dates.",
      data: { code: 'FX_FUTURE_DATE', field: 'rateDate' },
    })
  }
  return db.transaction(async (tx) => {
    await lockKey(tx, `fx:${access.organizationId}`)
    const checks: { currency: FxCurrency; message: string }[] = []
    const existing: {
      currency: FxCurrency
      rate: string
      enteredByName: string
      at: string
      id: string
    }[] = []
    for (const entry of input.rates) {
      const [previous] = await tx
        .select({ rate: fxRates.rate, rateDate: fxRates.rateDate })
        .from(fxRates)
        .where(
          and(live(access.organizationId, entry.currency), lt(fxRates.rateDate, input.rateDate)),
        )
        .orderBy(desc(fxRates.rateDate))
        .limit(1)
      const confirmed = input.confirmed.some(
        (c) => c.currency === entry.currency && dec(c.rate).equals(entry.rate),
      )
      if (previous && !confirmed && fxRateJump(previous.rate, entry.rate).needsCheck) {
        checks.push({
          currency: entry.currency,
          message: fxCheckMessage(entry.currency, entry.rate, {
            rate: previous.rate,
            date: previous.rateDate,
          }),
        })
      }
      const [same] = await tx
        .select()
        .from(fxRates)
        .where(
          and(live(access.organizationId, entry.currency), eq(fxRates.rateDate, input.rateDate)),
        )
      if (same) {
        existing.push({
          id: same.id,
          currency: entry.currency,
          rate: dec(same.rate).toString(),
          enteredByName: same.enteredByName,
          at: same.createdAt.toISOString(),
        })
      }
    }
    if (checks.length > 0) {
      throw new ORPCError('CONFLICT', {
        message: checks.map((check) => check.message).join(' '),
        data: { code: 'FX_RATE_CHECK', checks },
      })
    }
    if (existing.length > 0 && !input.replaceReason) {
      const message = existing
        .map(
          (rate) =>
            `${rate.currency} for ${dateLabel(input.rateDate)} is already ${naira(rate.rate)} (${rate.enteredByName}, ${clockIn('Africa/Lagos', new Date(rate.at))}).`,
        )
        .join(' ')
      throw new ORPCError('CONFLICT', {
        message: `${message} Replace it? Payments already taken keep the rate they used.`,
        data: { code: 'FX_RATE_EXISTS', existing: existing.map(({ id: _id, ...rest }) => rest) },
      })
    }
    for (const entry of input.rates) {
      const replaced = existing.find((rate) => rate.currency === entry.currency)
      const id = newId()
      // One live rate per currency and date (a unique index): the old one steps aside first.
      if (replaced) {
        await tx
          .update(fxRates)
          .set({ supersededAt: sql`now()`, supersededById: id })
          .where(eq(fxRates.id, replaced.id))
      }
      await tx.insert(fxRates).values({
        id,
        organizationId: access.organizationId,
        currency: entry.currency,
        rateDate: input.rateDate,
        rate: entry.rate,
        source: 'cbn',
        enteredByMemberId: access.memberId,
        enteredByName: access.userName,
        replaceReason: replaced ? (input.replaceReason ?? null) : null,
      })
      const after = {
        currency: entry.currency,
        rateDate: input.rateDate,
        rate: dec(entry.rate).toString(),
        source: 'cbn',
      }
      await recordAudit(tx, access, {
        action: replaced ? 'fx_rate.replaced' : 'fx_rate.entered',
        entityType: 'fx_rate',
        entityId: id,
        before: replaced
          ? { rateId: replaced.id, rate: replaced.rate, enteredByName: replaced.enteredByName }
          : null,
        after,
        reason: replaced ? (input.replaceReason ?? null) : null,
      })
    }
    return { saved: input.rates.length }
  })
}
