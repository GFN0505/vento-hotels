// FX rates (spec: stage-1-taxes-and-payment-methods.md, "FX rates"): naira per 1 unit of a foreign
// currency for a rate date, group-wide. Folios, charges and tax lines are always in naira (decision
// 2); foreign money only enters as tender. This file has the vocabulary, the display helper and the
// typo guard. It converts nothing that gets stored.
import { z } from 'zod'
import { type Decimal, dec, fxRateSourceSchema, toAmount } from './money.ts'

export const FX_CURRENCIES = ['USD', 'GBP', 'EUR'] as const
export type FxCurrency = (typeof FX_CURRENCIES)[number]
export const fxCurrencySchema = z.enum(FX_CURRENCIES)

export const FX_CURRENCY_LABELS: Record<FxCurrency, string> = {
  USD: 'US dollar',
  GBP: 'British pound',
  EUR: 'Euro',
}
export const FX_SYMBOLS: Record<FxCurrency, string> = { USD: '$', GBP: '£', EUR: '€' }

// Where a rate came from. Only CBN rates are entered in Stage 1; market rates (finance, with a
// reason) arrive with payments in brick 10 (decision 3).
export const fxSourceSchema = fxRateSourceSchema
export const FX_SOURCES = fxSourceSchema.options
export type FxSource = z.infer<typeof fxSourceSchema>
export const FX_SOURCE_LABELS: Record<FxSource, string> = { cbn: 'CBN', market: 'Market' }

// Naira per unit, above 0, up to 4 decimals; commas are tolerated as typed ("1,620.00").
export const fxRateValueSchema = z
  .string()
  .trim()
  .transform((value) => value.replaceAll(',', ''))
  .pipe(
    z
      .string()
      .regex(/^\d{1,9}(\.\d{1,4})?$/, 'Enter the naira rate, like 1620 or 1620.50')
      .refine((value) => dec(value).greaterThan(0), 'Enter a rate above 0'),
  )
  .transform((value) => dec(value).toFixed(4))

// A rate as stored and used: what a hotel's payment would quote.
export type FxQuote = { currency: FxCurrency; rate: string; source: FxSource; date: string }

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

// "1,620" or "1,620.5": the rate as people say it, without trailing zeros.
export function formatFxRate(rate: string): string {
  const [whole = '0', fraction = ''] = dec(rate).toString().split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${grouped}.${fraction}` : grouped
}

// The foreign equivalent of a naira amount, for display only ("≈ $113.43 at ₦1,620/$, CBN,
// 25 Nov 2026"). Rounded half-up to the cent. Never stored on rates or charges.
export function fxEquivalent(
  amountNgn: string,
  fx: FxQuote,
): { amount: string; currency: FxCurrency; text: string } {
  const amount = toAmount(dec(amountNgn).dividedBy(fx.rate))
  const symbol = FX_SYMBOLS[fx.currency]
  const [whole = '0', cents = '00'] = amount.replace('-', '').split('.')
  const shown = `${amount.startsWith('-') ? '−' : ''}${symbol}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`
  return {
    amount,
    currency: fx.currency,
    text: `≈ ${shown} at ₦${formatFxRate(fx.rate)}/${symbol}, ${FX_SOURCE_LABELS[fx.source]}, ${dateLabel(fx.date)}`,
  }
}

// The typo guard: a new rate more than this many percent away from the previous one asks to check.
// A UX check, not a statutory value.
export const FX_CHECK_PERCENT = '10'

export function fxRateJump(
  previous: string,
  next: string,
): { needsCheck: boolean; ratio: Decimal } {
  const ratio = dec(next).dividedBy(previous)
  const change = ratio.minus(1).abs().times(100)
  return { needsCheck: change.greaterThan(FX_CHECK_PERCENT), ratio }
}

// "₦16,200.00 is 10 times the last USD rate (₦1,620.00 on 24 Nov). Check the figure."
export function fxCheckMessage(
  currency: FxCurrency,
  next: string,
  previous: { rate: string; date: string },
): string {
  const { ratio } = fxRateJump(previous.rate, next)
  const shown = (value: string) => {
    const [whole = '0', fraction = '00'] = toAmount(value).split('.')
    return `₦${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
  }
  const day = dateLabel(previous.date).replace(/ \d{4}$/, '')
  const whole = (value: Decimal) => value.toDecimalPlaces(0).toString()
  const how = ratio.greaterThanOrEqualTo(2)
    ? `${whole(ratio)} times`
    : `${whole(ratio.minus(1).abs().times(100))}% ${ratio.greaterThan(1) ? 'above' : 'below'}`
  return `${shown(next)} is ${how} the last ${currency} rate (${shown(previous.rate)} on ${day}). Check the figure.`
}
