// Words and numbers for the taxes, payments and FX pages (spec: "UI copy"). Pure, so they are tested.
import {
  formatMoney,
  TAX_CATEGORY_LABELS,
  type TaxableCategory,
  type TaxRateView,
} from '@vento/shared'
import { dateLabel } from '../hotels/format'

export const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })

// "7.5%", or "Not charged" for a stop.
export function rateLabel(rate: Pick<TaxRateView, 'ratePercent' | 'stop'>): string {
  return rate.stop || rate.ratePercent === null ? 'Not charged' : `${rate.ratePercent}%`
}

// "since 1 Feb 2020", "1 Jan 2025 – 31 Dec 2026", "from 1 Jan 2027", "until 31 Dec 2024".
export function effectiveLabel(
  rate: Pick<TaxRateView, 'effectiveFrom' | 'effectiveTo' | 'status' | 'first'>,
): string {
  if (rate.status === 'scheduled') return `from ${dateLabel(rate.effectiveFrom)}`
  if (!rate.effectiveTo) return `since ${dateLabel(rate.effectiveFrom)}`
  if (rate.first && rate.status !== 'current') return `until ${dateLabel(rate.effectiveTo)}`
  return `${dateLabel(rate.effectiveFrom)} – ${dateLabel(rate.effectiveTo)}`
}

// "Rooms, food, drinks, events"
export function categoriesLabel(categories: readonly TaxableCategory[]): string {
  const words = categories.map((c, i) =>
    i === 0 ? TAX_CATEGORY_LABELS[c] : TAX_CATEGORY_LABELS[c].toLowerCase(),
  )
  return words.join(', ')
}

export const STATUS_TONE = {
  scheduled: 'amber',
  current: 'emerald',
  past: 'slate',
  stopped: 'slate',
} as const

export const STATUS_LABEL = {
  scheduled: 'Scheduled',
  current: 'Current',
  past: 'Past',
  stopped: 'Stopped',
} as const

// A typed percentage as the shared schema wants it, or a reason it isn't one.
export function ratePercentProblem(value: string): string | undefined {
  const trimmed = value.trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return 'Enter a rate like 7.5 or 12.5'
  const [whole = '0', fraction = ''] = trimmed.split('.')
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (hundredths <= 0 || hundredths > 10000) {
    return 'Enter a rate above 0% and up to 100%. To stop charging it, choose Stop charging it.'
  }
  return undefined
}
