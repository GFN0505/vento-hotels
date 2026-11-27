// The over-limit discount's rule, apart from its pricing (which needs the booking's functions):
// its permission and feature, and how an approval is bound to exactly one priced stay.
import { createHash } from 'node:crypto'
import type { createReservationSchema } from '@vento/shared'
import type { z } from 'zod'

type Stay = z.output<typeof createReservationSchema>['stays'][number]

export const STAY_DISCOUNT = {
  kind: 'stay_discount' as const,
  permission: 'stay.rate_override' as const,
  feature: 'front_desk' as const,
  valueKind: 'percent' as const,
}

// Binds the approval to exactly this stay at this hotel at this price: the priced hash covers the
// plan prices, discount, sold prices, tax lines, totals, deposit and cancellation; the stay's own
// fields make sure the same price on another room or date doesn't match.
export function stayBinding(propertyId: string, stay: Stay, pricedHash: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        STAY_DISCOUNT.kind,
        propertyId,
        stay.roomTypeId,
        stay.ratePlanId,
        stay.arrival,
        stay.departure,
        stay.adults,
        stay.children,
        pricedHash,
      ]),
    )
    .digest('hex')
}
