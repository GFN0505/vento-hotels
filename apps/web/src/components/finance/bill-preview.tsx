// "How a bill adds up" (replaces the design's "Price basis by department", see design CHANGES): a
// preview, not a setting. Pick a kind of charge and an amount, excl. or incl. taxes, and a date (to
// see a scheduled change); the lines come from the shared `taxLines` with the rules in force then.
import { useQuery } from '@tanstack/react-query'
import {
  amountSchema,
  type Pricing,
  TAX_CATEGORIES,
  TAX_CATEGORY_LABELS,
  type TaxCategory,
  type TaxSetup,
  taxLines,
} from '@vento/shared'
import { useId, useState } from 'react'
import { dateLabel } from '@/components/hotels/format'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { naira } from './format'

export function BillPreview({ setup }: { setup: TaxSetup }) {
  const headingId = useId()
  const [category, setCategory] = useState<TaxCategory>('accommodation')
  const [amount, setAmount] = useState('150000')
  const [pricing, setPricing] = useState<Pricing>('exclusive')
  const [date, setDate] = useState(setup.property.businessDate)
  const rules = useQuery({
    ...orpc.taxes.inForce.queryOptions({ input: { propertyId: setup.property.id, date } }),
    placeholderData: (previous) => previous,
  })
  const parsed = amountSchema.safeParse(amount.replaceAll(',', ''))
  const bill =
    parsed.success && rules.data
      ? taxLines({
          amount: parsed.data,
          currency: 'NGN',
          pricing,
          category,
          rules: rules.data.rules,
        })
      : undefined

  return (
    <section aria-labelledby={headingId}>
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3.5 sm:px-5">
          <h2 id={headingId} className="font-semibold">
            How a bill adds up
          </h2>
          <p className="text-sm text-text-2">
            A preview. Prices are set excl. or incl. taxes on each rate plan and menu.
          </p>
        </div>
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Kind of charge"
                value={category}
                onChange={(event) => setCategory(event.target.value as TaxCategory)}
                options={TAX_CATEGORIES.map((c) => ({ value: c, label: TAX_CATEGORY_LABELS[c] }))}
              />
              <Field
                label="Amount (₦)"
                name="amount"
                value={amount}
                inputMode="decimal"
                maxLength={16}
                error={parsed.success ? undefined : 'Enter an amount with up to 2 decimal places'}
                onChange={(event) => setAmount(event.target.value)}
                className="num max-lg:h-11"
              />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-text-2">Price</legend>
              <div className="inline-flex w-fit rounded-sm border border-border-strong bg-surface-2 p-0.5">
                {(['exclusive', 'inclusive'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={pricing === option}
                    onClick={() => setPricing(option)}
                    className={cn(
                      'h-11 rounded-[6px] px-3 text-sm font-medium lg:h-8',
                      pricing === option ? 'bg-surface text-text shadow-card' : 'text-text-2',
                    )}
                  >
                    {option === 'exclusive' ? 'Price excl. taxes' : 'Price incl. taxes'}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field
              label="Rates in force on"
              name="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value || setup.property.businessDate)}
              hint="Pick a later date to preview a scheduled change."
              className="num max-lg:h-11"
            />
          </div>
          <div
            aria-live="polite"
            className={cn('rounded-md border border-border', rules.isFetching && 'opacity-70')}
          >
            {bill ? (
              <dl className="num divide-y divide-border">
                <Line
                  label={pricing === 'inclusive' ? 'Net charge' : TAX_CATEGORY_LABELS[category]}
                  value={naira(bill.net)}
                />
                {bill.lines.map((line) => (
                  <Line
                    key={line.taxId}
                    label={`${line.name} ${line.ratePercent}%`}
                    value={naira(line.amount)}
                  />
                ))}
                {bill.rounding !== '0.00' ? (
                  <Line label="Rounding" value={naira(bill.rounding)} muted />
                ) : null}
                <Line label="Total" value={naira(bill.gross)} strong />
              </dl>
            ) : (
              <p className="p-4 text-text-2">
                {rules.isError
                  ? 'Couldn’t load the rates for that date.'
                  : 'Enter an amount to see the bill.'}
              </p>
            )}
            <p className="border-t border-border px-4 py-2.5 text-sm text-text-3">
              Uses the rates in force on {dateLabel(rules.data?.date ?? date)}.
              {bill && bill.lines.length === 0 ? ' No taxes apply to this kind of charge.' : ''}
            </p>
          </div>
        </div>
      </Card>
    </section>
  )
}

function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-4 px-4 py-2.5',
        strong && 'font-semibold',
        muted && 'text-text-3',
      )}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
