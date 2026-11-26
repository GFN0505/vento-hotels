// Modules and features that ship behind switches (decision 0021). Build a module behind an
// unreleased entry here; release it to everyone by setting `released: true` in a reviewed pull
// request, or to one group first with `pnpm features on <group> <feature>`.
// The platform (setup, team, permissions, audit log) is not listed: it's always on.
import { z } from 'zod'

type FeatureDefinition = {
  label: string
  // On for every group unless a group's switch says otherwise.
  released: boolean
  // A feature inside a module is only on when its module is.
  module?: string
}

export const FEATURES = {
  front_desk: { label: 'Reservations & front desk', released: false },
  booking_engine: { label: 'Booking engine & channel manager', released: false },
  guests_sales: { label: 'Guests & sales', released: false },
  restaurant_pos: { label: 'Restaurant & bar', released: false },
  housekeeping: { label: 'Housekeeping & maintenance', released: false },
  inventory: { label: 'Inventory & procurement', released: false },
  finance: { label: 'Finance', released: false },
  hr_payroll: { label: 'HR & payroll', released: false },
  guest_app: { label: 'Guest app', released: false },
  analytics: { label: 'Executive analytics', released: false },
} as const satisfies Record<string, FeatureDefinition>

export type Feature = keyof typeof FEATURES
export const FEATURE_KEYS = Object.keys(FEATURES) as Feature[]
export const featureSchema = z.enum(FEATURE_KEYS as [Feature, ...Feature[]])

export function isFeature(value: string): value is Feature {
  return (FEATURE_KEYS as string[]).includes(value)
}

// Which features are on for a group: its own switch where it has one, otherwise the catalog. A
// feature inside a module needs the module on too. `allOn` is for development and browser tests.
export function featuresOn(switches: ReadonlyMap<string, boolean>, allOn = false): Feature[] {
  const on = (key: Feature): boolean => {
    if (allOn) return true
    const definition: FeatureDefinition = FEATURES[key]
    const own = switches.get(key) ?? definition.released
    if (!own) return false
    return definition.module && isFeature(definition.module) ? on(definition.module) : true
  }
  return FEATURE_KEYS.filter(on)
}
