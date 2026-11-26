// Taxes and charges (spec: docs/specs/stage-1-taxes-and-payment-methods.md). This file holds the
// fixed vocabulary (kinds, categories, bases) and the one calculation every tax line in Vento comes
// from, on the server, on devices and in previews. It holds no rates: rates are data, versioned per
// group, state and hotel, and passed in as the rules in force (decision 0005, CLAUDE.md 13).
import { z } from 'zod'
import { idSchema } from './ids.ts'
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from './locale.ts'
import { type Decimal, dec, toAmount } from './money.ts'

// What kind of sale a charge is, for tax. Not statutory values: which taxes apply to which
// category is part of each rate version.
export const TAX_CATEGORIES = [
  'accommodation',
  'food',
  'beverage',
  'events',
  'laundry',
  'other',
  'exempt',
] as const
export type TaxCategory = (typeof TAX_CATEGORIES)[number]
export const taxCategorySchema = z.enum(TAX_CATEGORIES)

// The categories a rate can apply to: `exempt` never gets a line.
export const TAXABLE_CATEGORIES = TAX_CATEGORIES.filter(
  (category): category is Exclude<TaxCategory, 'exempt'> => category !== 'exempt',
)
export type TaxableCategory = (typeof TAXABLE_CATEGORIES)[number]
export const taxableCategorySchema = z.enum(
  TAXABLE_CATEGORIES as [TaxableCategory, ...TaxableCategory[]],
)

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  accommodation: 'Rooms',
  food: 'Food',
  beverage: 'Drinks',
  events: 'Events',
  laundry: 'Laundry',
  other: 'Other services',
  exempt: 'No tax',
}

export const TAX_KINDS = ['vat', 'state_tax', 'service_charge'] as const
export type TaxKind = (typeof TAX_KINDS)[number]
export const taxKindSchema = z.enum(TAX_KINDS)

// What a tax is calculated on. Service charge is always on the charge itself.
export const TAX_BASES = ['net', 'net_plus_service_charge'] as const
export type TaxBase = (typeof TAX_BASES)[number]
export const taxBaseSchema = z.enum(TAX_BASES)

export const PRICINGS = ['exclusive', 'inclusive'] as const
export type Pricing = (typeof PRICINGS)[number]
export const pricingSchema = z.enum(PRICINGS)

// A rate as typed: above 0, up to 100, up to 2 decimals ("7.5", "12.5", "10").
export const ratePercentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter a rate like 7.5 or 12.5')
  .refine(
    (value) => dec(value).greaterThan(0) && dec(value).lessThanOrEqualTo(100),
    'Enter a rate above 0% and up to 100%. To stop charging it, choose Stop charging it.',
  )
  .transform((value) => dec(value).toString())

// One rate in force for a hotel on a business date, as the server returns it. Enough to compute
// every line offline and to store on a posting (tax id, rate id, kind, name, rate).
export const taxRuleInForceSchema = z.object({
  taxId: idSchema,
  rateId: idSchema,
  kind: taxKindSchema,
  name: z.string(),
  ratePercent: z.string(),
  categories: z.array(taxableCategorySchema),
  base: taxBaseSchema,
})
export type TaxRuleInForce = z.infer<typeof taxRuleInForceSchema>

export const taxLineSchema = z.object({
  taxId: idSchema,
  rateId: idSchema,
  kind: taxKindSchema,
  name: z.string(),
  ratePercent: z.string(),
  base: z.string(),
  amount: z.string(),
})
export type TaxLine = z.infer<typeof taxLineSchema>

export const taxBreakdownSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
  pricing: pricingSchema,
  category: taxCategorySchema,
  // The charge without taxes. Always net + lines + rounding = gross; the hotel's net revenue is
  // net + rounding.
  net: z.string(),
  lines: z.array(taxLineSchema),
  // Inclusive prices only: kobo left over so the lines add up to the price. Part of net revenue.
  rounding: z.string(),
  gross: z.string(),
})
export type TaxBreakdown = z.infer<typeof taxBreakdownSchema>

const KIND_ORDER: Record<TaxKind, number> = { service_charge: 0, vat: 1, state_tax: 2 }

// Lines always appear in one order: service charge, VAT, then state taxes by name. No setting.
export function orderTaxRules<T extends Pick<TaxRuleInForce, 'kind' | 'name'>>(
  rules: readonly T[],
): T[] {
  return [...rules].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name),
  )
}

export type TaxLinesInput = {
  // A decimal string. Negative amounts work the same way, mirrored.
  amount: string
  currency: SupportedCurrency
  pricing: Pricing
  category: TaxCategory
  rules: readonly TaxRuleInForce[]
}

// The rules that give this category a line, in bill order.
function applicable(rules: readonly TaxRuleInForce[], category: TaxCategory): TaxRuleInForce[] {
  if (category === 'exempt') return []
  return orderTaxRules(
    rules.filter((rule) => (rule.categories as readonly TaxCategory[]).includes(category)),
  )
}

// Each line's unrounded base for a net amount: the net, or net plus the (rounded) service charge
// line when the rule says so. Service charge itself is always on the net.
function computeLines(net: Decimal, rules: readonly TaxRuleInForce[]): TaxLine[] {
  const serviceCharge = rules.find((rule) => rule.kind === 'service_charge')
  const serviceChargeAmount = serviceCharge
    ? dec(toAmount(net.times(serviceCharge.ratePercent).dividedBy(100)))
    : dec('0')
  return rules.map((rule) => {
    const base =
      rule.kind !== 'service_charge' && rule.base === 'net_plus_service_charge'
        ? net.plus(serviceChargeAmount)
        : net
    return {
      taxId: rule.taxId,
      rateId: rule.rateId,
      kind: rule.kind,
      name: rule.name,
      ratePercent: dec(rule.ratePercent).toString(),
      base: toAmount(base),
      // Rounded once, half-up, to the kobo.
      amount: toAmount(base.times(rule.ratePercent).dividedBy(100)),
    }
  })
}

// The combined effective rate of the lines on a net of 1, for backing the net out of a gross.
function combinedRate(rules: readonly TaxRuleInForce[]): Decimal {
  const serviceCharge = rules.find((rule) => rule.kind === 'service_charge')
  const sc = serviceCharge ? dec(serviceCharge.ratePercent).dividedBy(100) : dec('0')
  return rules.reduce((sum, rule) => {
    const rate = dec(rule.ratePercent).dividedBy(100)
    if (rule.kind === 'service_charge') return sum.plus(rate)
    return sum.plus(rule.base === 'net_plus_service_charge' ? rate.times(dec('1').plus(sc)) : rate)
  }, dec('0'))
}

const sumLines = (lines: readonly TaxLine[]) =>
  lines.reduce((sum, line) => sum.plus(line.amount), dec('0'))

// The tax lines for one charge.
// - Exclusive: net = amount; each line = base × rate, rounded once half-up; gross = net + lines.
// - Inclusive: gross = amount; net = gross ÷ (1 + combined rate), rounded half-up; lines from the
//   net as above; whatever kobo is left goes on one rounding line, so net + lines + rounding = gross.
// Lines are never recomputed for a reversal: the stored lines are copied negated.
export function taxLines(input: TaxLinesInput): TaxBreakdown {
  const amount = dec(input.amount)
  const rules = applicable(input.rules, input.category)
  const base = { currency: input.currency, pricing: input.pricing, category: input.category }
  if (input.pricing === 'exclusive') {
    const lines = computeLines(amount, rules)
    return {
      ...base,
      net: toAmount(amount),
      lines,
      rounding: toAmount('0'),
      gross: toAmount(amount.plus(sumLines(lines))),
    }
  }
  const gross = dec(toAmount(amount))
  const net = dec(toAmount(gross.dividedBy(dec('1').plus(combinedRate(rules)))))
  const lines = computeLines(net, rules)
  const rounding = gross.minus(net).minus(sumLines(lines))
  return {
    ...base,
    net: toAmount(net),
    lines,
    rounding: toAmount(rounding),
    gross: toAmount(gross),
  }
}

// --- Versions and their status -------------------------------------------------------------------

export const TAX_RATE_STATUSES = ['scheduled', 'current', 'past', 'stopped'] as const
export type TaxRateStatus = (typeof TAX_RATE_STATUSES)[number]

type Version = { effectiveFrom: string; stop: boolean }

// A version's status against a business date. Versions are the tax's live (not cancelled) ones.
// A stop is "stopped" from its start; before that it is scheduled like any change.
export function taxRateStatus(
  version: Version,
  versions: readonly Version[],
  businessDate: string,
): TaxRateStatus {
  if (version.effectiveFrom > businessDate) return 'scheduled'
  if (version.stop) return 'stopped'
  const later = versions.some(
    (other) => other.effectiveFrom > version.effectiveFrom && other.effectiveFrom <= businessDate,
  )
  return later ? 'past' : 'current'
}

// The version in force on a date: the latest that started on or before it. Undefined when none
// has started, or when the one in force is a stop.
export function versionInForce<T extends Version>(
  versions: readonly T[],
  date: string,
): T | undefined {
  let found: T | undefined
  for (const version of versions) {
    if (version.effectiveFrom <= date && (!found || version.effectiveFrom > found.effectiveFrom)) {
      found = version
    }
  }
  return found && !found.stop ? found : undefined
}
