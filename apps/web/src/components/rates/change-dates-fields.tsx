// The fields of Change dates: plan, room types, dates, days, price, season and restrictions.
import type { RatePlanView, RatesOverview, Weekday } from '@vento/shared'
import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { SelectField } from '@/components/ui/select-field'
import { cn } from '@/lib/cn'
import type { DatesForm, DatesProblems, Tri } from './change-dates-model'

type Props = {
  form: DatesForm
  problems: DatesProblems
  plans: readonly RatePlanView[]
  plan: RatePlanView | undefined
  overview: RatesOverview
  onChange: (change: Partial<DatesForm>) => void
}

const DAYS: [Weekday, string][] = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [0, 'Sun'],
]
const TRI: { value: Tri; label: string }[] = [
  { value: 'keep', label: 'Keep as they are' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

export function ChangeDatesFields({ form, problems, plans, plan, overview, onChange }: Props) {
  const id = useId()
  const types = overview.roomTypes.filter((t) => plan?.roomTypes.some((r) => r.roomTypeId === t.id))
  const all = types.length > 0 && types.every((t) => form.roomTypeIds.includes(t.id))
  const toggleType = (id: string, on: boolean) =>
    onChange({
      roomTypeIds: on
        ? types.map((t) => t.id).filter((x) => x === id || form.roomTypeIds.includes(x))
        : form.roomTypeIds.filter((x) => x !== id),
    })
  const { businessDate, lastRateDate } = overview.property
  return (
    <>
      <SelectField
        className="lg:h-9 lg:text-base"
        label="Plan"
        value={form.planId}
        hint="Plans that follow another change with it"
        options={plans.map((p) => ({ value: p.id, label: p.name }))}
        onChange={(event) => {
          const next = plans.find((p) => p.id === event.target.value)
          onChange({
            planId: event.target.value,
            roomTypeIds: (next?.roomTypes ?? []).map((r) => r.roomTypeId),
          })
        }}
      />
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5 text-sm font-medium text-text-2">Room types</legend>
        <label
          htmlFor={`${id}-all`}
          className="flex min-h-11 items-center gap-2.5 font-medium lg:min-h-8"
        >
          <Checkbox
            id={`${id}-all`}
            checked={all}
            onChange={(e) =>
              onChange({ roomTypeIds: e.target.checked ? types.map((t) => t.id) : [] })
            }
          />
          All room types
        </label>
        {types.map((t) => (
          <label
            key={t.id}
            htmlFor={`${id}-${t.id}`}
            className="flex min-h-11 items-center gap-2.5 pl-6 lg:min-h-8"
          >
            <Checkbox
              id={`${id}-${t.id}`}
              checked={form.roomTypeIds.includes(t.id)}
              onChange={(e) => toggleType(t.id, e.target.checked)}
            />
            {t.name}
          </label>
        ))}
        {problems.roomTypeIds ? (
          <p className="text-sm text-ro" role="alert">
            {problems.roomTypeIds}
          </p>
        ) : null}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="From"
          type="date"
          className="num"
          min={businessDate}
          max={lastRateDate}
          value={form.from}
          error={problems.from}
          onChange={(e) =>
            onChange({
              from: e.target.value,
              // Dates as YYYY-MM-DD sort as text: the later of the two.
              to: [form.to, e.target.value].sort().at(-1) ?? e.target.value,
            })
          }
        />
        <Field
          label="To"
          type="date"
          className="num"
          min={form.from || businessDate}
          max={lastRateDate}
          value={form.to}
          error={problems.to}
          onChange={(e) => onChange({ to: e.target.value })}
        />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-text-2">Days</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map(([day, name]) => {
            const on = form.days.includes(day)
            return (
              <label
                key={day}
                className={cn(
                  'relative inline-flex h-11 min-w-12 cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring lg:h-8',
                  on ? 'border-pri-line bg-pri-soft text-pri-ink' : 'border-border text-text-2',
                )}
              >
                <input
                  type="checkbox"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  checked={on}
                  onChange={() =>
                    onChange({
                      days: on ? form.days.filter((d) => d !== day) : [...form.days, day].sort(),
                    })
                  }
                />
                {name}
              </label>
            )
          })}
        </div>
        {problems.days ? (
          <p className="mt-1.5 text-sm text-ro" role="alert">
            {problems.days}
          </p>
        ) : null}
      </fieldset>
      <Segmented
        label="Price"
        value={form.priceMode}
        options={[
          { value: 'keep', label: 'Keep prices' },
          { value: 'set', label: 'New prices' },
          { value: 'standard', label: 'Back to standard price' },
        ]}
        onChange={(priceMode) => onChange({ priceMode })}
      />
      {form.priceMode === 'set' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {types
            .filter((t) => form.roomTypeIds.includes(t.id))
            .map((t) => (
              <Field
                key={t.id}
                label={t.name}
                name={`price-${t.id}`}
                prefix="₦"
                inputMode="numeric"
                autoComplete="off"
                className="num"
                value={form.prices[t.id] ?? ''}
                error={problems[`price-${t.id}`]}
                onChange={(e) => onChange({ prices: { ...form.prices, [t.id]: e.target.value } })}
              />
            ))}
        </div>
      ) : null}
      <Field
        label="Season name (optional)"
        placeholder="e.g. Festive season"
        maxLength={40}
        hint="A label over these dates in the calendar"
        value={form.season}
        error={problems.season}
        onChange={(e) => onChange({ season: e.target.value })}
      />
      <Segmented
        label="Min stay"
        value={form.minStay}
        options={TRI}
        onChange={(minStay) => onChange({ minStay })}
      />
      {form.minStay === 'on' ? (
        <Field
          label="Nights, from the arrival date"
          suffix="nights"
          inputMode="numeric"
          className="num sm:max-w-48"
          value={form.minStayNights}
          error={problems.minStayNights}
          onChange={(e) => onChange({ minStayNights: e.target.value })}
        />
      ) : null}
      <Segmented
        label="Closed to arrival"
        value={form.closedToArrival}
        options={TRI}
        onChange={(closedToArrival) => onChange({ closedToArrival })}
      />
      <Segmented
        label="Closed"
        value={form.closed}
        options={TRI}
        onChange={(closed) => onChange({ closed })}
      />
    </>
  )
}
