// "Guest pays per night" (deferred from rate plans to reservations, designs #19 and #33): a price as
// typed plus the tax lines in force on the business date, so whoever sets rates sees what the guest
// hears. Read with the rates page's own permissions, which include reading taxes; others don't see
// it. A meal plan's meal allocation is taxed as food, the rest as accommodation (as bookings are).
import { useQuery } from '@tanstack/react-query'
import { nightTaxes, ratePriceSchema } from '@vento/shared'
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
  // What the guest pays for a night at `price` (whole naira as typed), or null when it can't be told.
  const pays = (price: string, mealAllocation = '0', inclusive = false): string | null => {
    const parsed = ratePriceSchema.safeParse(price)
    if (!parsed.success || !rules.data) return null
    const meal = ratePriceSchema.safeParse(mealAllocation || '0')
    return nightTaxes(
      {
        soldPrice: parsed.data,
        extraAdult: '0.00',
        mealAllocation: meal.success ? meal.data : '0.00',
      },
      rules.data.rules,
      inclusive,
    ).gross
  }
  // The column shows once the rules are in; until taxes are set up, a note says so instead.
  return { visible, column: visible && !notSetUp, notSetUp: visible && notSetUp, pays }
}
