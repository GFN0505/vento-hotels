// Room & rate (design: NewReservation step 2): one card per room type in sort order with rooms
// left per night, and the plans that sell it: name, derived tag, meal plan and cancellation, the
// price per night (excl. or incl. taxes, remembered on the device) and the total incl. taxes.
import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  type Availability,
  type AvailabilityRoomType,
  type BookablePlan,
  checkInOn,
} from '@vento/shared'
import { AlertTriangle } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { LoadError } from '@/components/settings/load-states'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/cn'
import { errorCode, problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { cancellationShort, dateLabel, datesSummary, mealLabel, naira } from '../format'
import { type Draft, updateDraft } from './booking-draft'

const BASIS_KEY = 'vento.rateBasis'
type Basis = 'excl' | 'incl'

function readBasis(): Basis {
  try {
    return localStorage.getItem(BASIS_KEY) === 'incl' ? 'incl' : 'excl'
  } catch {
    return 'excl'
  }
}

type Props = {
  draft: Draft
  availability: UseQueryResult<Availability>
  hotelName: string
}

export function StepRoomRate({ draft, availability, hotelName }: Props) {
  const [basis, setBasis] = useState<Basis>(readBasis)
  const me = useMe()
  const chooseBasis = (next: Basis) => {
    setBasis(next)
    try {
      localStorage.setItem(BASIS_KEY, next)
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
  }

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="num inline-flex h-7 items-center rounded-sm bg-pri-soft px-2.5 text-sm font-medium text-pri-ink">
          {datesSummary(draft.arrival, draft.departure, draft.adults, draft.children)}
        </span>
      </div>
      <Segmented
        label="Prices per night"
        hideLabel
        value={basis}
        options={[
          { value: 'excl', label: 'Excl. taxes' },
          { value: 'incl', label: 'Incl. taxes' },
        ]}
        onChange={chooseBasis}
      />
    </div>
  )

  if (availability.isPending) {
    return (
      <section aria-label="Room & rate" className="flex flex-col gap-3">
        {heading}
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading availability"
          className="flex flex-col gap-3"
        >
          {['a', 'b', 'c'].map((key) => (
            <span key={key} className="h-20 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      </section>
    )
  }
  if (availability.isError && !availability.data) {
    const code = errorCode(availability.error)
    return (
      <section aria-label="Room & rate" className="flex flex-col gap-3">
        {heading}
        {code ? (
          <StateMessage>{problemMessage(availability.error)}</StateMessage>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-medium">Couldn't load availability. Nothing was booked.</p>
            <LoadError onRetry={() => availability.refetch()} retrying={availability.isFetching} />
          </div>
        )}
      </section>
    )
  }
  const data = availability.data
  if (data.setup === 'no_rooms') {
    return (
      <StateMessage>
        {hotelName} has no rooms yet. Rooms are set up in Rates &amp; channels.{' '}
        {me.can('rooms.setup') ? (
          <Link to="/rates/rooms" className="font-medium text-pri-ink hover:underline">
            Set up rooms
          </Link>
        ) : null}
      </StateMessage>
    )
  }
  if (data.setup === 'no_rates') {
    return <StateMessage>No rates set for {hotelName} yet. Ask your GM to set rates.</StateMessage>
  }

  // The chosen type, or the first that can be sold, starts open.
  const open = draft.roomTypeId ?? data.roomTypes.find((type) => type.sellable)?.id
  return (
    <section aria-label="Room & rate" className="flex flex-col gap-3">
      {heading}
      {data.fullyBooked ? (
        <p role="status" className="rounded-sm bg-am-bg px-3 py-2 text-sm text-am">
          Fully booked for {dateLabel(data.fullyBooked.date, false)}. Overbooking limit reached.
          {data.fullyBooked.freeFrom
            ? ` Rooms are free from ${dateLabel(data.fullyBooked.freeFrom, false)}.`
            : ''}
          {data.fullyBooked.freeBefore
            ? ` Rooms are free on ${dateLabel(data.fullyBooked.freeBefore, false)}.`
            : ''}
        </p>
      ) : null}
      {data.roomTypes.map((type) => (
        <RoomTypeCard
          key={type.id}
          type={type}
          draft={draft}
          basis={basis}
          expanded={type.id === open}
          timeZone={data.property.timeZone}
          checkInTime={data.property.checkInTime}
        />
      ))}
    </section>
  )
}

function StateMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-4 py-4"
    >
      <AlertTriangle className="mt-0.5 size-4 flex-none text-am" aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}

function LeftBadges({ type }: { type: AvailabilityRoomType }) {
  if (type.nights.length === 0) {
    return (
      <span className="num text-sm text-text-2">
        {type.lowest.left} left on {dateLabel(type.lowest.date, false)}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-sm text-text-3">Left per night</span>
      {type.nights.map((night) => (
        <span
          key={night.date}
          title={`${night.left} left on ${dateLabel(night.date, false)}`}
          className={cn(
            'num inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
            night.left === 0
              ? 'bg-ro-bg text-ro'
              : night.left <= 3
                ? 'bg-am-bg text-am'
                : 'bg-surface-2 text-text-2 ring-1 ring-border',
          )}
        >
          {night.left}
        </span>
      ))}
    </span>
  )
}

function why(type: AvailabilityRoomType): string | null {
  if (type.reason === 'too_many_guests') {
    const kids = type.maxChildren
      ? ` and ${type.maxChildren === 1 ? '1 child' : `${type.maxChildren} children`}`
      : ''
    return `Sleeps ${type.maxAdults === 1 ? '1 adult' : `${type.maxAdults} adults`}${kids}`
  }
  if (type.reason === 'not_priced') return `No rates for ${type.name} on these dates.`
  if (type.reason === 'sold_out') {
    const [first] = type.soldOut
    return type.soldOut.length === 1 && first
      ? `Sold out ${dateLabel(first, false)}`
      : `Sold out ${type.soldOut.length} nights`
  }
  return null
}

function RoomTypeCard({
  type,
  draft,
  basis,
  expanded,
  timeZone,
  checkInTime,
}: {
  type: AvailabilityRoomType
  draft: Draft
  basis: Basis
  expanded: boolean
  timeZone: string
  checkInTime: string
}) {
  const reason = why(type)
  const selected = draft.roomTypeId === type.id
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-card',
        selected && 'border-pri-line ring-3 ring-pri-soft',
        !type.sellable && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h4 className="truncate font-semibold">{type.name}</h4>
          {reason ? <span className="text-sm text-text-3">{reason}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LeftBadges type={type} />
          {!expanded && type.from && type.sellable ? (
            <span className="num text-sm text-text-3">
              from <span className="text-text">{naira(type.from)}</span>
            </span>
          ) : null}
        </div>
      </div>
      {expanded && type.sellable ? (
        <fieldset className="border-t border-border">
          <legend className="sr-only">Plans for {type.name}</legend>
          {type.plans.map((plan) => (
            <PlanOption
              key={plan.ratePlanId}
              type={type}
              plan={plan}
              checked={selected && draft.ratePlanId === plan.ratePlanId}
              basis={basis}
              arrival={draft.arrival}
              timeZone={timeZone}
              checkInTime={checkInTime}
            />
          ))}
        </fieldset>
      ) : !expanded && type.sellable ? (
        <button
          type="button"
          className="w-full border-t border-border px-4 py-2 text-left text-sm font-medium text-pri-ink hover:bg-surface-2"
          onClick={() =>
            updateDraft({
              roomTypeId: type.id,
              ratePlanId: type.plans[0]?.ratePlanId,
              discount: undefined,
            })
          }
        >
          Show {type.plans.length === 1 ? 'the plan' : `${type.plans.length} plans`}
          <span className="sr-only"> for {type.name}</span>
        </button>
      ) : null}
    </div>
  )
}

// The deadline for a plan's cancellation line: the hotel's check-in time on arrival − N hours.
function deadlineOf(plan: BookablePlan, arrival: string, checkInTime: string, timeZone: string) {
  if (plan.terms.cancellation.kind !== 'free_until') return null
  const checkIn = checkInOn(arrival, { checkInTime, timeZone })
  return new Date(checkIn.getTime() - plan.terms.cancellation.hours * 3_600_000)
}

function PlanOption({
  type,
  plan,
  checked,
  basis,
  arrival,
  timeZone,
  checkInTime,
}: {
  type: AvailabilityRoomType
  plan: BookablePlan
  checked: boolean
  basis: Basis
  arrival: string
  timeZone: string
  checkInTime: string
}) {
  const price = basis === 'excl' ? plan.perNightExcl : plan.perNightIncl
  const deadline = deadlineOf(plan, arrival, checkInTime, timeZone)
  const terms = cancellationShort(plan.terms.cancellation, plan.terms.deposit, deadline, timeZone)
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-surface-2/60',
        checked && 'bg-pri-soft',
      )}
    >
      <input
        type="radio"
        name={`plan-${type.id}`}
        checked={checked}
        onChange={() =>
          updateDraft({
            roomTypeId: type.id,
            ratePlanId: plan.ratePlanId,
            discount: undefined,
            restrictionReason: '',
          })
        }
        className="mt-1 size-4 accent-[var(--pri)]"
      />
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{plan.name}</span>
          {plan.derivedLabel ? (
            <span className="rounded-sm bg-surface-2 px-1.5 text-xs text-text-2 ring-1 ring-border">
              {plan.derivedLabel}
            </span>
          ) : null}
        </span>
        <span className="text-sm text-text-2">
          {mealLabel(plan.terms)} · {terms.charAt(0).toLowerCase() + terms.slice(1)}
        </span>
        {plan.breaks.map((b) => (
          <span key={`${b.kind}${b.date}`} className="text-sm text-am">
            {b.message}
          </span>
        ))}
      </span>
      <span className="num flex flex-none flex-col items-end">
        <span className={cn(checked && 'font-medium')}>
          {plan.varies ? 'avg ' : ''}
          {naira(price)}
          <span className="text-sm text-text-2"> /night</span>
        </span>
        <span className="text-sm text-text-2">{naira(plan.totalIncl)} total incl. taxes</span>
      </span>
    </label>
  )
}
