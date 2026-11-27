// Brick 6's two approval kinds, apart from their pricing (which needs the change service): their
// permission and feature, and how an approval is bound to exactly one action.
// - penalty_waiver: a permission without a limit ("ask someone who has it"); bound to the
//   reservation, the action (cancel, no-show, change, or a penalty already recorded), the stay
//   version it was worked out on, the penalty kind and amount, and the reason for waiving.
// - modify_discount: a discount over the saver's limit on a changed stay; bound to the reservation,
//   stay, version and the priced change hash.
import { createHash } from 'node:crypto'

export const PENALTY_WAIVER = {
  kind: 'penalty_waiver' as const,
  permission: 'penalty.waive' as const,
  feature: 'front_desk' as const,
  valueKind: 'amount_ngn' as const,
}

export const MODIFY_DISCOUNT = {
  kind: 'modify_discount' as const,
  permission: 'stay.rate_override' as const,
  feature: 'front_desk' as const,
  valueKind: 'percent' as const,
}

const hash = (parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')

export type WaiverBinding = {
  propertyId: string
  reservationId: string
  target: 'cancel' | 'no_show' | 'modify' | 'penalty'
  // The stay version (sum for cancel and no-show); null for a penalty already recorded.
  version: number | null
  penaltyKind: string
  amount: string
  // The priced change for a late change; the penalty's id for a recorded penalty.
  changeHash: string | null
  penaltyId: string | null
  reason: string
}

export const waiverBinding = (b: WaiverBinding) =>
  hash([
    PENALTY_WAIVER.kind,
    b.propertyId,
    b.reservationId,
    b.target,
    b.version,
    b.penaltyKind,
    b.amount,
    b.changeHash,
    b.penaltyId,
    b.reason.trim(),
  ])

export const modifyBinding = (b: {
  propertyId: string
  reservationId: string
  stayId: string
  version: number
  changeHash: string
}) => hash([MODIFY_DISCOUNT.kind, b.propertyId, b.reservationId, b.stayId, b.version, b.changeHash])
