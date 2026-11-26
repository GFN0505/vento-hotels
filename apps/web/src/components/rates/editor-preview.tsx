// The editor's preview (design #33): for a derived plan, the parent's price on the business date
// next to this plan's, per room type, as typed. For own prices, where seasons and single dates
// are set. The parent's price that night comes from the calendar, so date prices count too. Guest
// pays adds the tax lines in force that night, inclusive or exclusive as the plan says.
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { RatePlanView, RatesOverview } from '@vento/shared'
import { CalendarDays } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatNaira, PER_NIGHT_EXCL, shortDate } from './format'
import { TAXES_FIRST, useGuestPays } from './guest-pays'
import { GuestPays } from './guest-pays-cell'
import type { PlanForm } from './plan-form-model'
import { previewRows } from './preview-model'
import { calendarQuery } from './queries'

type Props = {
  overview: RatesOverview
  form: PlanForm
  parent: RatePlanView | undefined
}

// The parent's price per room type on the business date.
export function useParentPrices(overview: RatesOverview, parentId: string | undefined) {
  const tonight = useQuery({
    ...calendarQuery({
      propertyId: overview.property.id,
      from: overview.property.businessDate,
      nights: 1,
      includeCorporate: true,
    }),
    enabled: Boolean(parentId),
  })
  const prices = new Map<string, string>()
  for (const type of tonight.data?.roomTypes ?? []) {
    const row = type.rows.find((r) => r.ratePlanId === parentId)
    const cell = row?.cells[0]
    if (cell) prices.set(type.id, cell.price)
  }
  return { prices, pending: tonight.isPending && Boolean(parentId) }
}

export function EditorPreview({ overview, form, parent }: Props) {
  const date = overview.property.businessDate
  const { prices, pending } = useParentPrices(overview, parent?.id)
  const guest = useGuestPays(overview.property.id)
  if (form.pricing === 'own') {
    return (
      <Card className="flex flex-col gap-2 p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <CalendarDays className="size-4 text-text-3" aria-hidden="true" />
          Seasons and single dates
        </h2>
        <p className="text-sm text-text-2">
          Standard prices apply unless a date has its own. Set seasons, weekends and closures in the
          Rate calendar.
        </p>
        <Link
          to="/rates/calendar"
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-pri-ink hover:underline lg:min-h-0"
        >
          Open the Rate calendar
        </Link>
      </Card>
    )
  }
  const rows = previewRows(
    form,
    overview.roomTypes.map((t) => t.id),
    prices,
  )
  const names = new Map(overview.roomTypes.map((t) => [t.id, t.name]))
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">Preview · {shortDate(date)}</h2>
        <span className="text-sm text-text-3">{PER_NIGHT_EXCL}</span>
      </div>
      {!parent ? (
        <p className="px-5 py-4 text-sm text-text-2">
          Choose a parent plan to see this plan's prices.
        </p>
      ) : (
        <table className="w-full border-collapse text-left" aria-busy={pending || undefined}>
          <thead>
            <tr className="border-b border-border text-xs font-medium text-text-3">
              <th scope="col" className="px-5 py-2">
                Room type
              </th>
              <th scope="col" className="num px-3 py-2 text-right">
                {parent.code}
              </th>
              <th
                scope="col"
                className={cn('py-2 text-right', guest.column ? 'px-3 max-sm:px-5' : 'px-5')}
              >
                This plan
              </th>
              {guest.column ? (
                <th scope="col" className="px-5 py-2 text-right max-sm:hidden">
                  Guest pays
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.roomTypeId}>
                <th scope="row" className="px-5 py-2.5 font-normal break-words">
                  {names.get(row.roomTypeId)}
                </th>
                <td className="num px-3 py-2.5 text-right whitespace-nowrap text-text-2">
                  {row.parent ? formatNaira(row.parent) : pending ? '…' : '—'}
                </td>
                <td
                  className={cn(
                    'num py-2.5 text-right font-medium whitespace-nowrap',
                    guest.column ? 'px-3 max-sm:px-5' : 'px-5',
                    row.notPositive && 'text-ro',
                  )}
                >
                  {row.price ? formatNaira(row.price) : '—'}
                </td>
                {guest.column ? (
                  <td className="num px-5 py-2.5 text-right whitespace-nowrap text-text-2 max-sm:hidden">
                    {row.price && !row.notPositive ? (
                      <GuestPays
                        guest={guest}
                        price={row.price}
                        mealAllocation={form.mealPlan === 'room_only' ? '0' : form.mealAllocation}
                        inclusive={form.pricesIncludeTaxes}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {guest.notSetUp ? (
        <p className="border-t border-border px-5 py-3 text-sm text-text-3">{TAXES_FIRST}</p>
      ) : null}
    </Card>
  )
}
