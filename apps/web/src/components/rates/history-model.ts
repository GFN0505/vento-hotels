// Change history in words (design #33: "Offset ₦15,000 → ₦18,000 · Femi Lawal · 1 Oct 2026"): what
// changed on a plan, read from its audit event's before and after. Payloads come over the network,
// so every field is read defensively; anything unknown falls back to a plain title.
import { formatNaira, formatRateDate } from '@vento/shared'
import { listNames } from './format'

type Fields = Record<string, unknown>
const obj = (v: unknown): Fields => (v && typeof v === 'object' ? (v as Fields) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const naira = (v: unknown) => (str(v) ? formatNaira(str(v) as string) : 'none')

const TITLES: Record<string, string> = {
  'rate_plan.created': 'Plan created',
  'rate_plan.changed': 'Terms changed',
  'rate_plan.prices_changed': 'Standard prices changed',
  'rate_plan.archived': 'Archived',
  'rate_plan.restored': 'Restored',
  'rate_plans.reordered': 'Order changed',
  'rates.dates_changed': 'Dates changed',
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  code: 'Code',
  pricing: 'Price',
  parentId: 'Parent plan',
  mealPlan: 'Meal plan',
  mealAllocation: 'Meal allocation',
  cancellation: 'Cancellation',
  deposit: 'Deposit',
  minStay: 'Min stay',
  extraAdult: 'Extra adult',
  bookableBy: 'Who can book it',
  pricesIncludeTaxes: 'Prices include taxes',
}

function adjustment(v: unknown): string {
  const a = obj(v)
  if (a.kind === 'percent' && str(a.value)) return `${Number(a.value)}%`
  if (a.kind === 'amount') return naira(a.value)
  return 'none'
}

function pricesLines(before: Fields, after: Fields): string[] {
  const was = Array.isArray(before.prices) ? before.prices.map(obj) : []
  const now = Array.isArray(after.prices) ? after.prices.map(obj) : []
  return now.map((row) => {
    const old = was.find((w) => w.roomTypeId === row.roomTypeId) ?? {}
    const name = str(row.roomTypeName) ?? 'A room type'
    if (!str(old.weekday)) return `${name} added at ${naira(row.weekday)}`
    if (!str(row.weekday)) return `${name} removed`
    return `${name} ${naira(old.weekday)} → ${naira(row.weekday)}`
  })
}

function datesLine(after: Fields): string {
  const from = str(after.from)
  const to = str(after.to)
  const range =
    from && to
      ? from === to
        ? formatRateDate(from)
        : `${formatRateDate(from)}–${formatRateDate(to)}`
      : null
  const types = Array.isArray(after.roomTypes)
    ? listNames(after.roomTypes.map((t) => str(obj(t).roomTypeName) ?? '').filter(Boolean))
    : null
  const cells = Array.isArray(after.cells) ? after.cells.map(obj) : []
  const prices = new Set(cells.map((c) => str(c.price)).filter(Boolean))
  const price = prices.size === 1 ? naira([...prices][0]) : null
  return [range, types, price, str(after.seasonName)].filter(Boolean).join(' · ')
}

function termsLines(before: Fields, after: Fields): string[] {
  const lines: string[] = []
  if ('adjustment' in after)
    lines.push(`Offset ${adjustment(before.adjustment)} → ${adjustment(after.adjustment)}`)
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (!(key in after)) continue
    const simple = (v: unknown) =>
      typeof v === 'string' || typeof v === 'number' ? String(v) : null
    const a = simple(before[key])
    const b = simple(after[key])
    lines.push(a && b && key !== 'parentId' ? `${label} ${a} → ${b}` : `${label} changed`)
  }
  const added = Array.isArray(after.roomTypesAdded) ? after.roomTypesAdded : []
  const removed = Array.isArray(before.roomTypesRemoved) ? before.roomTypesRemoved : []
  if (added.length)
    lines.push(`Added ${listNames(added.map((t) => str(obj(t).roomTypeName) ?? 'a room type'))}`)
  if (removed.length)
    lines.push(
      `Removed ${listNames(removed.map((t) => str(obj(t).roomTypeName) ?? 'a room type'))}`,
    )
  return lines
}

export function describeChange(event: { action: string; before?: unknown; after?: unknown }): {
  title: string
  lines: string[]
} {
  const before = obj(event.before)
  const after = obj(event.after)
  const title = TITLES[event.action] ?? 'Changed'
  const lines =
    event.action === 'rate_plan.prices_changed'
      ? pricesLines(before, after)
      : event.action === 'rates.dates_changed'
        ? [datesLine(after)].filter(Boolean)
        : event.action === 'rate_plan.changed'
          ? termsLines(before, after)
          : []
  // A few lines at most; the audit log has the rest.
  return { title: str(after.undoOf) ? `${title} (undo)` : title, lines: lines.slice(0, 3) }
}
