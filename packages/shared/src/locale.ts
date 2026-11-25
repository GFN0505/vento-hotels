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

// The 36 states and the Federal Capital Territory, for property addresses and state taxes.
export const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT (Abuja)',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const
