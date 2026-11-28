// Beside "Your first rate": what Best available comes with (the recommended terms, spec OQ 9 and
// 10) and, with breakfast ticked, what Bed & breakfast will cost from the prices typed so far.
import { BREAKFAST_SUPPLEMENT, dec, type RatesOverview, ratePriceSchema } from '@vento/shared'
import { Check } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type * as M from './first-rate-model'
import { formatNaira, INCL } from './format'
import type { useGuestPays } from './guest-pays'
import { GuestPays } from './guest-pays-cell'

// What the new plans come with, so nobody has to guess (the recommended terms, spec OQ 9 and 10).
export function FirstRateAside({
  breakfast,
  types,
  rows,
  guest,
}: {
  breakfast: boolean
  types: RatesOverview['roomTypes']
  rows: M.FirstRateRows
  guest: ReturnType<typeof useGuestPays>
}) {
  const lines = [
    'Room only',
    'Free cancellation until 48 hours before arrival, then the first night',
    'Deposit: first night, within 48 hours of booking',
    `Prices ${INCL}`,
  ]
  // What Bed & breakfast will cost, from the weekday prices typed so far.
  const withBreakfast = types.flatMap((type) => {
    const typed = ratePriceSchema.safeParse(rows[type.id]?.weekday ?? '')
    if (!typed.success) return []
    return [
      {
        id: type.id,
        name: type.name,
        price: dec(typed.data).plus(BREAKFAST_SUPPLEMENT).toFixed(2),
      },
    ]
  })
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-md font-semibold">Best available comes with</h2>
      <ul className="flex flex-col gap-2 text-text-2">
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            <Check className="mt-0.5 size-4 flex-none text-em" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>
      {breakfast ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="font-semibold">Bed &amp; breakfast, Sun–Thu</h3>
          {withBreakfast.length > 0 ? (
            <ul className="flex flex-col gap-1 text-text-2">
              {withBreakfast.map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="num flex flex-col items-end">
                    <span className="font-medium text-text">{formatNaira(row.price)}</span>
                    {guest.column ? (
                      <span className="text-sm text-text-3">
                        <GuestPays
                          guest={guest}
                          price={row.price}
                          mealAllocation={BREAKFAST_SUPPLEMENT}
                        />
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-3">Type a price to see it here.</p>
          )}
          <p className="text-sm text-text-3">
            Best available +{formatNaira(BREAKFAST_SUPPLEMENT)} a night; the{' '}
            {formatNaira(BREAKFAST_SUPPLEMENT)} counts as breakfast.
          </p>
        </div>
      ) : null}
      <p className="text-sm text-text-3">Change any of this later in the plan.</p>
    </Card>
  )
}
