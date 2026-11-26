// Review & book (spec): everything on one page: guest, stay, room type, plan and its terms in words,
// the nightly table with tax lines, deposit and cancellation; any restriction broken with its
// reason (required); any discount with its reason; a same-guest overlapping booking as a note.
import { DISCOUNT_REASON_LABELS, type Property, SOURCE_LABELS, type StayQuote } from '@vento/shared'
import type { ReactNode } from 'react'
import { TH } from '@/components/settings/table-styles'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import {
  cancellationLine,
  dayLabel,
  depositBasis,
  mealLabel,
  naira,
  stayLine,
  stayRange,
  taxLabel,
} from '../format'
import { type Draft, updateDraft } from './booking-draft'
import { restrictionLabel } from './booking-model'

type Props = { draft: Draft; quote: StayQuote | undefined; hotel: Property | undefined }

export function StepReview({ draft, quote, hotel }: Props) {
  if (!quote) {
    return <p className="text-text-2">Pick a room and plan first.</p>
  }
  const tz = hotel?.timeZone ?? 'Africa/Lagos'
  const guest = draft.guest
  const name = [guest.title, guest.firstName, guest.lastName].filter(Boolean).join(' ')
  const broken = quote.breaks[0]
  const discount = draft.discount
  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-5">
      <h3 id="review-heading" className="text-[15px] font-semibold">
        Review &amp; book
      </h3>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Item label="Guest">
          {name}
          <span className="block text-sm text-text-3">
            {[guest.phone, guest.email].filter(Boolean).join(' · ')}
          </span>
        </Item>
        <Item label="Stay">
          {stayLine(draft.arrival, draft.departure)}
          <span className="block text-sm text-text-3">
            {draft.adults === 1 ? '1 adult' : `${draft.adults} adults`}
            {draft.children
              ? `, ${draft.children === 1 ? '1 child' : `${draft.children} children`}`
              : ''}
            {hotel ? ` · ${hotel.name}` : ''}
          </span>
        </Item>
        <Item label="Room and plan">
          {quote.roomTypeName} · {quote.terms.planName}
          <span className="block text-sm text-text-3">{mealLabel(quote.terms)}</span>
        </Item>
        <Item label="How they booked">
          {SOURCE_LABELS[draft.source]}
          {draft.notes.trim() ? (
            <span className="block text-sm text-text-3">{draft.notes.trim()}</span>
          ) : null}
        </Item>
      </dl>

      {quote.overlaps.map((overlap) => (
        <p key={overlap.id} role="status" className="rounded-sm bg-bl-bg px-3 py-2 text-sm text-bl">
          {guest.firstName} {guest.lastName} already has {overlap.number} for{' '}
          {stayRange(overlap.arrival, overlap.departure).replace(/ \d{4}$/, '')}.
        </p>
      ))}

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th scope="col" className={cn(TH, 'pl-3')}>
                Night
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                Price
              </th>
              {quote.totals.lines.map((line) => (
                <th key={line.key} scope="col" className={cn(TH, 'text-right whitespace-nowrap')}>
                  {taxLabel(line)}
                </th>
              ))}
              <th scope="col" className={cn(TH, 'pr-3 text-right')}>
                Total
              </th>
            </tr>
          </thead>
          <tbody className="num">
            {quote.nights.map((night) => (
              <tr key={night.date} className="[&>td]:border-b [&>td]:border-border">
                <td className="py-2 pr-2 pl-3 whitespace-nowrap">{dayLabel(night.date)}</td>
                <td className="px-2 py-2 text-right">{naira(night.net)}</td>
                {quote.totals.lines.map((line) => (
                  <td key={line.key} className="px-2 py-2 text-right text-text-2">
                    {naira(night.lines.find((l) => l.key === line.key)?.amount ?? '0')}
                  </td>
                ))}
                <td className="py-2 pr-3 pl-2 text-right">{naira(night.gross)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-2 pl-3">Total</td>
              <td className="px-2 py-2 text-right">{naira(quote.totals.net)}</td>
              {quote.totals.lines.map((line) => (
                <td key={line.key} className="px-2 py-2 text-right">
                  {naira(line.amount)}
                </td>
              ))}
              <td className="py-2 pr-3 pl-2 text-right">{naira(quote.totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {discount && quote.discount ? (
        <p className="num rounded-sm bg-am-bg px-3 py-2 text-sm text-am">
          {quote.discount.percent}% off {quote.terms.planName} ·{' '}
          {discount.reason ? DISCOUNT_REASON_LABELS[discount.reason] : ''}
          {discount.reasonText ? ` · “${discount.reasonText}”` : ''}. Recorded with your name.
        </p>
      ) : null}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Item label="Deposit">
          {quote.deposit ? naira(quote.deposit.amount) : 'No deposit'}
          {quote.deposit ? (
            <span className="block text-sm text-text-3">
              {depositBasis(quote.terms.deposit, quote.deposit.dueAt, tz)}
            </span>
          ) : null}
        </Item>
        <Item label="Cancellation">
          <span className="text-sm">{cancellationLine(quote.cancellation, tz)}</span>
        </Item>
      </dl>

      {broken ? (
        <div className="flex flex-col gap-2 rounded-sm border border-am-dot/40 bg-am-bg p-3">
          <p className="text-sm text-am">{broken.message}</p>
          <Field
            label={restrictionLabel(broken.kind)}
            value={draft.restrictionReason}
            maxLength={300}
            required
            hint="Required. Recorded with your name."
            validate={(value) =>
              value.trim().length < 3
                ? `Give a reason for booking through ${broken.kind === 'min_stay' ? 'the min stay' : broken.kind === 'closed' ? 'the closure' : 'the closed-to-arrival day'}.`
                : undefined
            }
            onChange={(event) => updateDraft({ restrictionReason: event.target.value })}
            className="max-lg:h-11"
          />
        </div>
      ) : null}
      {quote.fx ? <p className="num text-sm text-text-2">{quote.fx.text}</p> : null}
    </section>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] leading-4 font-semibold tracking-[0.05em] text-text-3 uppercase">
        {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
