// The summary beside steps 2–4 (design: NewReservation's aside): nights, the room part, tax lines in
// bill order, total, deposit due, cancellation and, for a foreign guest, the equivalent in their
// currency. On Room & rate it also holds Change rate: Discount and Rate per night, linked, with a
// reason (spec: "Discounts").
import type { UseQueryResult } from '@tanstack/react-query'
import {
  DISCOUNT_REASON_LABELS,
  DISCOUNT_REASONS,
  type DiscountReason,
  type Property,
  type StayQuote,
} from '@vento/shared'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { cancellationLine, dayLabel, depositBasis, naira, stayLine, taxLabel } from '../format'
import { type Draft, updateDraft } from './booking-draft'
import { overLimitNotice, type Problems, percentFromRate, rateFromPercent } from './booking-model'

type Props = {
  draft: Draft
  quote: UseQueryResult<StayQuote>
  hotel: Property | undefined
  editable: boolean
  limits: { canDiscount: boolean; discountLimit: string | null }
  problems: Problems
}

const MAX_LINES = 7

export function SummaryAside({ draft, quote, hotel, editable, limits, problems }: Props) {
  const data = quote.data
  const tz = hotel?.timeZone ?? 'Africa/Lagos'
  return (
    <aside
      aria-label="Summary"
      className="flex flex-col gap-4 border-t border-border bg-surface-2 px-5 py-5 lg:border-t-0 lg:border-l"
    >
      {!data ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase">
            Summary
          </span>
          <span className="text-sm text-text-2">
            {quote.isError
              ? 'Couldn’t price this stay. Pick another plan.'
              : 'Pick a plan to see the total.'}
          </span>
        </div>
      ) : (
        <div
          aria-live="polite"
          className={cn('flex flex-col gap-4', quote.isFetching && 'opacity-70')}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase">
              Summary
            </span>
            <span className="font-semibold">
              {data.roomTypeName} · {data.terms.planName}
            </span>
            <span className="num text-sm text-text-2">
              {stayLine(draft.arrival, draft.departure)}
            </span>
          </div>
          <Lines quote={data} />
          <div className="flex flex-col gap-1 rounded-sm bg-surface px-3 py-2.5 ring-1 ring-border">
            <div className="flex justify-between gap-2 font-medium">
              <span>{data.deposit ? 'Deposit due' : 'No deposit'}</span>
              {data.deposit ? <span className="num">{naira(data.deposit.amount)}</span> : null}
            </div>
            {data.deposit ? (
              <span className="text-sm text-text-3">
                {depositBasis(data.terms.deposit, data.deposit.dueAt, tz)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase">
              Cancellation
            </span>
            <span className="num text-sm text-text-2">
              {cancellationLine(data.cancellation, tz)}
            </span>
          </div>
          {data.fx ? (
            <p className="flex flex-col gap-1 text-sm">
              <span className="w-fit rounded-sm bg-surface px-1.5 text-xs font-medium ring-1 ring-border">
                Foreign national
              </span>
              <span className="num text-text-2">{data.fx.text}</span>
            </p>
          ) : null}
          <span className="text-sm text-text-3">
            {data.terms.pricesIncludeTaxes
              ? 'Rates include service charge and taxes.'
              : 'Rates exclude service charge and taxes.'}
          </span>
        </div>
      )}
      {editable && data ? (
        <ChangeRate draft={draft} quote={data} limits={limits} problems={problems} />
      ) : null}
    </aside>
  )
}

function Lines({ quote }: { quote: StayQuote }) {
  const net = quote.totals.net
  const roomWords =
    quote.terms.mealPlan === 'room_only'
      ? 'Room'
      : quote.terms.mealPlan === 'bed_breakfast'
        ? 'Room & breakfast'
        : 'Room & meals'
  return (
    <div className="num flex flex-col gap-1.5">
      {quote.nights.length <= MAX_LINES ? (
        quote.nights.map((night) => (
          <div key={night.date} className="flex justify-between gap-2">
            <span className="text-text-2">{dayLabel(night.date)}</span>
            <span>
              {night.soldPrice !== night.planPrice ? (
                <s className="mr-1.5 text-text-3">{naira(night.planPrice)}</s>
              ) : null}
              {naira(night.soldPrice)}
            </span>
          </div>
        ))
      ) : (
        <div className="flex justify-between gap-2">
          <span className="text-text-2">{quote.nights.length} nights</span>
        </div>
      )}
      <div className="my-1 h-px bg-border" />
      <div className="flex justify-between gap-2">
        <span>{roomWords}</span>
        <span>{naira(net)}</span>
      </div>
      {quote.totals.lines.map((line) => (
        <div key={line.key} className="flex justify-between gap-2 text-sm text-text-2">
          <span>{taxLabel(line)}</span>
          <span>{naira(line.amount)}</span>
        </div>
      ))}
      {quote.totals.rounding !== '0.00' ? (
        <div className="flex justify-between gap-2 text-sm text-text-2">
          <span>Rounding</span>
          <span>{naira(quote.totals.rounding)}</span>
        </div>
      ) : null}
      <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border-strong pt-2">
        <span className="font-semibold">Total</span>
        <span className="text-lg font-semibold">{naira(quote.totals.total)}</span>
      </div>
    </div>
  )
}

function ChangeRate({
  draft,
  quote,
  limits,
  problems,
}: {
  draft: Draft
  quote: StayQuote
  limits: { canDiscount: boolean; discountLimit: string | null }
  problems: Problems
}) {
  const [open, setOpen] = useState(Boolean(draft.discount))
  const planPrice = quote.nights[0]?.planPrice ?? '0'
  const discount = draft.discount
  // The two fields as typed; the one not being typed in follows.
  const [typed, setTyped] = useState<{ percent: string; rate: string }>(() => ({
    percent:
      discount?.kind === 'percent'
        ? discount.value
        : discount
          ? percentFromRate(discount.value, planPrice)
          : '',
    rate:
      discount?.kind === 'rate'
        ? discount.value
        : discount
          ? rateFromPercent(discount.value, planPrice)
          : '',
  }))
  if (!limits.canDiscount && !discount) return null
  if (!open) {
    return (
      <Button className="self-start max-lg:h-11" onClick={() => setOpen(true)}>
        Change rate
      </Button>
    )
  }
  const base = discount ?? {
    kind: 'percent' as const,
    value: '',
    reason: undefined,
    reasonText: '',
    note: '',
  }
  const set = (patch: Partial<typeof base>) => updateDraft({ discount: { ...base, ...patch } })
  const first = quote.nights[0]
  const changed = first && first.soldPrice !== first.planPrice
  return (
    <section
      aria-label="Change rate"
      className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-3"
    >
      <h4 className="font-semibold">Change rate</h4>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Discount"
          id="discount-percent"
          inputMode="decimal"
          suffix="%"
          value={typed.percent}
          aria-invalid={problems.value && base.kind === 'percent' ? true : undefined}
          aria-describedby={problems.value ? 'discount-problem' : undefined}
          onChange={(event) => {
            const percent = event.target.value
            setTyped({ percent, rate: rateFromPercent(percent, planPrice) })
            set({ kind: 'percent', value: percent })
          }}
          className="max-lg:h-11"
        />
        <Field
          label="Rate per night"
          inputMode="decimal"
          prefix="₦"
          value={typed.rate}
          aria-invalid={problems.value && base.kind === 'rate' ? true : undefined}
          aria-describedby={problems.value ? 'discount-problem' : undefined}
          onChange={(event) => {
            const rate = event.target.value
            setTyped({ rate, percent: percentFromRate(rate, planPrice) })
            set({ kind: 'rate', value: rate })
          }}
          className="max-lg:h-11"
        />
      </div>
      {problems.value && base.value.trim() ? (
        <p id="discount-problem" role="alert" className="text-sm text-ro">
          {problems.value}
        </p>
      ) : overLimitNotice(draft.discount, quote, limits) ? (
        <p role="status" className="rounded-sm bg-am-bg px-2.5 py-1.5 text-sm text-am">
          {overLimitNotice(draft.discount, quote, limits)}
        </p>
      ) : null}
      {limits.discountLimit !== null ? (
        <p className="text-sm text-text-3">
          Your limit: {limits.discountLimit.replace(/\.00$/, '')}%
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-text-2">Reason</legend>
        <div className="flex flex-wrap gap-1.5">
          {DISCOUNT_REASONS.map((reason: DiscountReason) => (
            <label
              key={reason}
              className={cn(
                'relative inline-flex h-11 cursor-pointer items-center rounded-full border border-border-strong px-3 text-sm lg:h-8',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                base.reason === reason && 'border-pri-line bg-pri-soft text-pri-ink',
              )}
            >
              <input
                type="radio"
                name="discount-reason"
                className="absolute inset-0 cursor-pointer opacity-0"
                checked={base.reason === reason}
                onChange={() => set({ reason })}
              />
              {DISCOUNT_REASON_LABELS[reason]}
            </label>
          ))}
        </div>
        {problems.reason ? <p className="text-sm text-ro">{problems.reason}</p> : null}
      </fieldset>
      {base.reason === 'other' ? (
        <Field
          label="Why"
          value={base.reasonText}
          maxLength={200}
          error={problems.reasonText}
          onChange={(event) => set({ reasonText: event.target.value })}
          className="max-lg:h-11"
        />
      ) : null}
      <Field
        label="Note (optional)"
        value={base.note}
        maxLength={500}
        onChange={(event) => set({ note: event.target.value })}
        className="max-lg:h-11"
      />
      <p className="text-sm text-text-3">
        Recorded with your name. This shows in the owner's daily report.
      </p>
      {changed && first ? (
        <p className="num text-sm font-medium">
          {naira(first.planPrice)} → {naira(first.soldPrice)} a night ·{' '}
          {quote.discount?.percent ?? ''}% off {quote.terms.planName}
        </p>
      ) : null}
      <Button
        variant="ghost"
        className="self-start max-lg:h-11"
        onClick={() => {
          updateDraft({ discount: undefined })
          setTyped({ percent: '', rate: '' })
          setOpen(false)
        }}
      >
        Remove discount
      </Button>
    </section>
  )
}
