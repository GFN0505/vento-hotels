// "Guest pays per night" (deferred from rate plans to reservations, designs #19 and #33): a price as
// typed plus the tax lines in force on the business date, so whoever sets rates sees what the guest
// hears. For an all-in price (the default, decision 0032) it shows "Before taxes" instead: what the
// hotel keeps once the taxes inside are taken out. Read with the rates page's own permissions,
// which include reading taxes; others don't see it. A meal plan's meal allocation is taxed as food, the rest as accommodation (as bookings are).
import { useQuery } from '@tanstack/react-query'
import { dec, nightTaxes, ratePriceSchema, toAmount } from '@vento/shared'
import { orpc } from '@/lib/api'
import { errorCode } from '@/lib/errors'
import { useMe } from '@/lib/me'

export const TAXES_FIRST = 'Set up taxes to see what guests pay'

export function useGuestPays(propertyId: string) {
  const me = useMe()
  const visible = ['finance.setup', 'rates.edit', 'rooms.setup'].some((p) =>
    me.can(p as 'finance.setup'),
  )
  const rules = useQuery({
    ...orpc.taxes.inForce.queryOptions({ input: { propertyId } }),
    enabled: visible,
    retry: false,
  })
  const notSetUp = errorCode(rules.error) === 'TAXES_NOT_SET_UP'
  // The other side of a night at `price` (whole naira as typed): what the guest pays when the price
  // is before taxes, or what's left before taxes when it's all-in (the rounding kobo are the
  // hotel's, as on the bill). Null when it can't be told.
  const pays = (price: string, mealAllocation = '0', inclusive = true): string | null => {
    const parsed = ratePriceSchema.safeParse(price)
    if (!parsed.success || !rules.data) return null
    const meal = ratePriceSchema.safeParse(mealAllocation || '0')
    const night = nightTaxes(
      {
        soldPrice: parsed.data,
        extraAdult: '0.00',
        mealAllocation: meal.success ? meal.data : '0.00',
      },
      rules.data.rules,
      inclusive,
    )
    return inclusive ? toAmount(dec(night.net).plus(night.rounding)) : night.gross
  }
  // The column shows once the rules are in; until taxes are set up, a note says so instead.
  return { visible, column: visible && !notSetUp, notSetUp: visible && notSetUp, pays }
}
