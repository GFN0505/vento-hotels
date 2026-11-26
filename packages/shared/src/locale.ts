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

export type NigerianState = (typeof NIGERIAN_STATES)[number]

export function isNigerianState(value: string): value is NigerianState {
  return (NIGERIAN_STATES as readonly string[]).includes(value)
}

// ISO 3166-2:NG subdivision codes, the scope of a state tax ("LA", "FC", "RI").
export const STATE_CODES: Record<NigerianState, string> = {
  Abia: 'AB',
  Adamawa: 'AD',
  'Akwa Ibom': 'AK',
  Anambra: 'AN',
  Bauchi: 'BA',
  Bayelsa: 'BY',
  Benue: 'BE',
  Borno: 'BO',
  'Cross River': 'CR',
  Delta: 'DE',
  Ebonyi: 'EB',
  Edo: 'ED',
  Ekiti: 'EK',
  Enugu: 'EN',
  'FCT (Abuja)': 'FC',
  Gombe: 'GO',
  Imo: 'IM',
  Jigawa: 'JI',
  Kaduna: 'KD',
  Kano: 'KN',
  Katsina: 'KT',
  Kebbi: 'KE',
  Kogi: 'KO',
  Kwara: 'KW',
  Lagos: 'LA',
  Nasarawa: 'NA',
  Niger: 'NI',
  Ogun: 'OG',
  Ondo: 'ON',
  Osun: 'OS',
  Oyo: 'OY',
  Plateau: 'PL',
  Rivers: 'RI',
  Sokoto: 'SO',
  Taraba: 'TA',
  Yobe: 'YO',
  Zamfara: 'ZA',
}

export function stateCodeOf(state: string | null | undefined): string | null {
  return state && isNigerianState(state) ? STATE_CODES[state] : null
}

// The state as said in a sentence: "Lagos", "FCT".
export function stateShortName(code: string): string {
  if (code === 'FC') return 'FCT'
  const found = (Object.entries(STATE_CODES) as [NigerianState, string][]).find(
    ([, value]) => value === code,
  )
  return found?.[0] ?? code
}
