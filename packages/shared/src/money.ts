// Money rules (CLAUDE.md non-negotiable 5, decision 0004):
// - amounts are strings with at most 2 decimals, matching Postgres numeric(14,2);
// - all maths uses decimal.js, never JS numbers;
// - keep intermediate results as Decimal and round once, half-up, at the end with `toAmount`;
// - an amount always travels with its currency; mixing currencies is an error.
import { Decimal as DecimalJs } from 'decimal.js'
import { z } from 'zod'
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from './locale.ts'

export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP })
export type Decimal = InstanceType<typeof Decimal>

// numeric(14,2): up to 12 digits before the point, up to 2 after.
const AMOUNT_PATTERN = /^-?\d{1,12}(\.\d{1,2})?$/

export const currencySchema = z.enum(SUPPORTED_CURRENCIES)

export const amountSchema = z
  .string()
  .trim()
  .regex(AMOUNT_PATTERN, 'Enter an amount with up to 2 decimal places')
  .transform((value) => normalizeAmount(value))

export const moneySchema = z.object({
  amount: amountSchema,
  currency: currencySchema,
})
export type Money = { amount: string; currency: SupportedCurrency }

// Where an FX rate came from: the CBN official rate, or a market rate set by finance (decision 3 of
// the taxes and payments spec).
export const fxRateSourceSchema = z.enum(['cbn', 'market'])

// A rate stored beside every foreign-currency amount: NGN per 1 unit of the foreign currency.
export const fxRateSchema = z.object({
  rate: z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,6})?$/, 'Enter a rate with up to 6 decimal places')
    .refine((value) => new Decimal(value).greaterThan(0), 'The rate must be more than zero'),
  source: fxRateSourceSchema,
  date: z.iso.date(),
})
export type FxRate = z.infer<typeof fxRateSchema>

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Can't combine ${a} and ${b} amounts without an FX rate`)
  }
}

export function dec(value: string | Decimal): Decimal {
  return new Decimal(value)
}

// Rounds once, half-up, to 2 decimals and returns the canonical string ("125000.00").
export function toAmount(value: string | Decimal): string {
  const rounded = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  return (rounded.isZero() ? new Decimal(0) : rounded).toFixed(2)
}

export function normalizeAmount(value: string): string {
  return toAmount(value)
}

function sameCurrency(a: Money, b: Money): SupportedCurrency {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency)
  return a.currency
}

export function money(amount: string | Decimal, currency: SupportedCurrency): Money {
  return { amount: toAmount(amount), currency }
}

export function addMoney(a: Money, b: Money): Money {
  return money(dec(a.amount).plus(b.amount), sameCurrency(a, b))
}

export function subtractMoney(a: Money, b: Money): Money {
  return money(dec(a.amount).minus(b.amount), sameCurrency(a, b))
}

export function sumMoney(items: readonly Money[], currency: SupportedCurrency): Money {
  let total = dec('0')
  for (const item of items) {
    if (item.currency !== currency) throw new CurrencyMismatchError(currency, item.currency)
    total = total.plus(item.amount)
  }
  return money(total, currency)
}

// Unrounded share of a base for a percentage rate ("7.5" means 7.5%). Round with `toAmount`
// when the result is final, e.g. when the tax line is stored.
export function percentOf(base: string | Decimal, ratePercent: string): Decimal {
  return dec(base).times(ratePercent).dividedBy(100)
}

// Converts a foreign amount to NGN with the recorded rate (NGN per 1 unit). Rounds once.
export function toNaira(foreign: Money, fx: FxRate): Money {
  if (foreign.currency === 'NGN') return foreign
  return money(dec(foreign.amount).times(fx.rate), 'NGN')
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b)
  return dec(a.amount).comparedTo(b.amount) as -1 | 0 | 1
}

export function isZeroMoney(value: Money): boolean {
  return dec(value.amount).isZero()
}

const formatters = new Map<string, Intl.NumberFormat>()

// "₦125,000.00", "$85.00", "£323.53", "−₦5,000.00". Intl formats the decimal string exactly.
export function formatMoney(value: Money): string {
  let formatter = formatters.get(value.currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: value.currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    formatters.set(value.currency, formatter)
  }
  // Intl accepts decimal strings in Node 24, so no float conversion happens here.
  // Intl writes a hyphen for negatives; the designs and printed documents use a true minus (U+2212).
  return formatter.format(value.amount as unknown as number).replace(/^-/, '−')
}
