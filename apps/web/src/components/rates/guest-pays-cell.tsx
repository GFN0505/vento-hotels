// One "Guest pays" figure: the price with taxes, "Set up taxes…" when they aren't, or a dash.
import { formatMoney } from '@vento/shared'
import type { useGuestPays } from './guest-pays'

export function GuestPays({
  guest,
  price,
  mealAllocation,
  inclusive,
}: {
  guest: ReturnType<typeof useGuestPays>
  price: string
  mealAllocation?: string
  inclusive?: boolean
}) {
  const amount = guest.pays(price, mealAllocation, inclusive)
  return amount ? (
    <span>{formatMoney({ amount, currency: 'NGN' })}</span>
  ) : (
    <span className="text-text-3">—</span>
  )
}
