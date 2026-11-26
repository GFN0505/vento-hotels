// The editor's live preview (design #33, "Preview · Wed 25 Nov"): for each room type, the parent's
// price on the business date and what this plan costs with the adjustment as typed, with the same
// shared maths the server uses (derivePrice: Decimal, rounded once, half-up, to the whole naira).
import { dec, derivePrice, rateAdjustmentSchema } from '@vento/shared'
import { nairaField } from './money-input'
import { adjustmentOf, type PlanForm } from './plan-form-model'

export type PreviewRow = {
  roomTypeId: string
  // The parent's price that night, or null when the parent doesn't sell this type.
  parent: string | null
  // This plan's price; null while the adjustment isn't a valid one yet.
  price: string | null
  // ₦0 or less: the save would be refused.
  notPositive: boolean
}

export function previewRows(
  form: PlanForm,
  roomTypeIds: readonly string[],
  parentPrices: ReadonlyMap<string, string>,
): PreviewRow[] {
  const parsed = rateAdjustmentSchema.safeParse(adjustmentOf(form))
  return roomTypeIds
    .filter((id) => form.rows[id]?.on)
    .map((roomTypeId) => {
      const parent = parentPrices.get(roomTypeId) ?? null
      const price = parent && parsed.success ? derivePrice(parent, parsed.data) : null
      return {
        roomTypeId,
        parent,
        price,
        notPositive: price !== null && !dec(price).greaterThan(0),
      }
    })
}

// Switching a derived plan to own prices starts from what it costs today (spec: "pre-fills
// standard prices with today's derived prices").
export function ownPricesFromPreview(rows: readonly PreviewRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    if (row.price && !row.notPositive) out[row.roomTypeId] = nairaField(row.price)
  }
  return out
}
