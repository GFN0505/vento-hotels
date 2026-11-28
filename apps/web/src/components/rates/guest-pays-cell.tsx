// One "Guest pays" figure under a price: the price with taxes for a plan priced before taxes, or
// "Before taxes" for an all-in plan (decision 0032); "—" when it can't be told yet.
import { formatMoney } from '@vento/shared'
import type { useGuestPays } from './guest-pays'

export function GuestPays({
  guest,
  price,
  mealAllocation,
  inclusive = true,
  perNight = false,
}: {
  guest: ReturnType<typeof useGuestPays>
  price: string
  mealAllocation?: string
  inclusive?: boolean
  perNight?: boolean
}) {
  const amount = guest.pays(price, mealAllocation, inclusive)
  const label = `${inclusive ? 'Before taxes' : 'Guest pays'}${perNight ? ' per night' : ''}`
  return (
    <>
      {label}{' '}
      {amount ? (
        <span>{formatMoney({ amount, currency: 'NGN' })}</span>
      ) : (
        <span className="text-text-3">—</span>
      )}
    </>
  )
}
