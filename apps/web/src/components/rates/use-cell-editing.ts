// Inline price edits shared by the grid and the phone list: which cell is open, and saving one
// night for one room type ("Deluxe King on 5 Dec set to ₦165,000 · Undo").
import { ALL_WEEKDAYS, ratePriceSchema } from '@vento/shared'
import { useState } from 'react'
import type { CellRef } from './calendar-model'
import { formatNaira, formatRateDate } from './format'
import type { RateDates } from './use-rate-dates'

export const cellKey = (ref: CellRef) => `${ref.typeId}:${ref.planId}:${ref.date}`

export function useCellEditing(rateDates: RateDates) {
  const [editing, setEditing] = useState<{ key: string; initial: string }>()
  const pending = rateDates.pendingInput
  return {
    editingValue: (ref: CellRef) => (editing?.key === cellKey(ref) ? editing.initial : undefined),
    isPending: (ref: CellRef) =>
      Boolean(
        pending &&
          pending.ratePlanId === ref.planId &&
          pending.from === ref.date &&
          pending.to === ref.date &&
          pending.roomTypeIds.length === 1 &&
          pending.roomTypeIds[0] === ref.typeId,
      ),
    start: (ref: CellRef, initial: string) => setEditing({ key: cellKey(ref), initial }),
    cancel: () => setEditing(undefined),
    commit: (ref: CellRef, typeName: string, value: string) => {
      setEditing(undefined)
      const price = ratePriceSchema.parse(value)
      rateDates.apply(
        {
          ratePlanId: ref.planId,
          roomTypeIds: [ref.typeId],
          from: ref.date,
          to: ref.date,
          days: [...ALL_WEEKDAYS],
          prices: [{ roomTypeId: ref.typeId, price }],
        },
        () => `${typeName} on ${formatRateDate(ref.date, false)} set to ${formatNaira(price)}`,
      )
    },
  }
}

export type CellEditing = ReturnType<typeof useCellEditing>
