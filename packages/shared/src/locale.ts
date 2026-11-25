// Product-wide locale defaults (docs/DOMAIN.md, "Locale defaults").
// These are defaults for new records, not statutory rules: tax rates and similar
// live in versioned configuration, never in code.

export const DEFAULT_CURRENCY = 'NGN'
export const DEFAULT_TIME_ZONE = 'Africa/Lagos'

export const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code)
}
