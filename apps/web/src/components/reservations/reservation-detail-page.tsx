// One reservation (design #5 ReservationDetail, ReservationMobile; read-only in this brick): who,
// the stay, what was sold night by night with tax lines in force on each night, the deposit and
// cancellation terms, and what happened. Actions: Copy confirmation and Audit trail. Modify,
// cancel, room move and check-in come with their bricks; nothing links to what isn't built.
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  DISCOUNT_REASON_LABELS,
  dec,
  formatPhone,
  type ReservationDetail,
  SOURCE_LABELS,
  toAmount,
} from '@vento/shared'
import { AlertTriangle, ClipboardCopy, History } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { AuditSheet } from '@/components/audit/audit-sheet'
import { Message } from '@/components/rooms/message'
import { FormSkeleton } from '@/components/settings/load-states'
import { TH } from '@/components/settings/table-styles'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { CANT_REACH_VENTO, errorCode, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { describeReservationEvent } from './activity-format'
import { confirmationText } from './confirmation'
import {
  cancellingNowLine,
  dateLabel,
  dayLabel,
  depositBasis,
  initials,
  instantDate,
  instantLabel,
  isOverdue,
  mealLabel,
  naira,
  nightsBetweenDates,
  nightsLabel,
  statusLabel,
  statusTone,
  stayRange,
  taxLabel,
} from './format'
import { ReservationsOffline } from './offline-note'
import { useCountries } from './use-countries'

export function ReservationDetailPage({ id }: { id: string }) {
  const detail = useQuery(orpc.reservations.get.queryOptions({ input: { id } }))
  useScopedTitle(detail.data ? detail.data.number : 'Reservation')
  const [auditing, setAuditing] = useState(false)

  if (detail.isPending) return <FormSkeleton />
  if (detail.isError && !detail.data) {
    // Not found (another group's, or a hotel outside the member's access) has no retry.
    const missing =
      errorCode(detail.error) !== undefined || problemMessage(detail.error) !== CANT_REACH_VENTO
    return (
      <div className="flex flex-col gap-4">
        <Crumbs number={undefined} />
        <Card>
          <Message icon={AlertTriangle} title={problemMessage(detail.error)} alert>
            {missing ? null : (
              <Button className="max-lg:h-11" onClick={() => detail.refetch()}>
                Try again
              </Button>
            )}
          </Message>
        </Card>
      </div>
    )
  }
  const data = detail.data
  return (
    <div className="flex flex-col gap-4">
      <ReservationsOffline savedAt={detail.dataUpdatedAt} />
      <Crumbs number={data.number} />
      <Header data={data} onAudit={() => setAuditing(true)} />
      {/* Activity sits beside the nights only on wide screens, so the nights table never clips. */}
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {data.stays.map((stay) => (
            <NightsCard key={stay.id} stay={stay} taxesSetUp={data.taxesSetUp} />
          ))}
          <div className="grid gap-4 lg:grid-cols-2">
            <GuestCard data={data} />
            <DepositCard data={data} />
          </div>
        </div>
        <ActivityCard data={data} onAudit={() => setAuditing(true)} />
      </div>
      {auditing ? (
        <AuditSheet
          entityType="reservation"
          entityId={data.id}
          title={`${data.number} · ${data.guest.firstName} ${data.guest.lastName}`}
          describe={describeReservationEvent}
          empty="Nothing recorded for this reservation yet."
          onClose={() => setAuditing(false)}
        />
      ) : null}
    </div>
  )
}

function Crumbs({ number }: { number: string | undefined }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-text-2">
      <Link
        to="/reservations"
        className="inline-flex min-h-11 items-center hover:text-pri-ink hover:underline lg:min-h-0"
      >
        Reservations
      </Link>
      {number ? (
        <>
          <span className="text-text-3" aria-hidden="true">
            /
          </span>
          <span className="num" aria-current="page">
            {number}
          </span>
        </>
      ) : null}
    </nav>
  )
}

function Header({ data, onAudit }: { data: ReservationDetail; onAudit: () => void }) {
  const tz = data.property.timeZone
  const stay = data.stays[0]
  const name = `${data.guest.firstName} ${data.guest.lastName}`
  const copy = async () => {
    const { text, noTransferAccount } = confirmationText(data)
    try {
      await navigator.clipboard.writeText(text)
      toast.success(
        noTransferAccount
          ? 'Confirmation copied. No transfer account is set for this hotel.'
          : 'Confirmation copied',
      )
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.")
    }
  }
  const rate = stay ? rateSummary(stay) : null
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            aria-hidden="true"
            className="grid size-12 flex-none place-items-center rounded-full bg-pri-soft text-base font-semibold text-pri-ink"
          >
            {initials(data.guest.firstName, data.guest.lastName)}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                tabIndex={-1}
                className="truncate text-[22px] leading-tight font-semibold tracking-[-0.02em] focus:outline-none"
                title={name}
              >
                {name}
              </h1>
              <StatusBadge tone={statusTone(data.status)}>{statusLabel(data.status)}</StatusBadge>
              <span className="num text-sm text-text-3">{data.number}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-2">
              {data.guest.nationality !== 'NG' ? (
                <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs font-medium ring-1 ring-border">
                  Foreign national
                </span>
              ) : null}
              <span className="num">
                Booked {dateLabel(instantDate(data.bookedAt, tz))} by {data.bookedByName} ·{' '}
                {SOURCE_LABELS[data.source]}
              </span>
              {data.property.archived ? <span>· {data.property.name} was archived</span> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.canAudit ? (
            <Button className="max-lg:h-11" onClick={onAudit}>
              <History className="size-4" aria-hidden="true" />
              Audit trail
            </Button>
          ) : null}
          <Button variant="primary" className="max-lg:h-11" onClick={copy}>
            <ClipboardCopy className="size-4" aria-hidden="true" />
            Copy confirmation
          </Button>
        </div>
      </div>
      {stay ? (
        <dl className="grid gap-4 border-t border-border px-5 py-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <Summary label="Stay" value={stayRange(stay.arrival, stay.departure)}>
            {nightsLabel(nightsBetweenDates(stay.arrival, stay.departure))} ·{' '}
            {stay.adults === 1 ? '1 adult' : `${stay.adults} adults`}
            {stay.children
              ? ` · ${stay.children === 1 ? '1 child' : `${stay.children} children`}`
              : ''}
          </Summary>
          <Summary label="Room" value={stay.roomTypeName}>
            Not assigned
          </Summary>
          <Summary label="Rate" value={rate?.value ?? ''}>
            {stay.terms.planName} · {mealLabel(stay.terms).toLowerCase()}
          </Summary>
          <Summary label="Stay total" value={naira(data.quotedTotal)}>
            incl. service charge &amp; taxes
          </Summary>
          <Summary
            label="Deposit"
            value={data.depositDue ? naira(data.depositDue.amount) : 'Not required'}
            tone={data.depositDue ? (isOverdue(data.depositDue) ? 'rose' : 'amber') : undefined}
          >
            {data.depositDue
              ? `${isOverdue(data.depositDue) ? 'overdue, was due' : 'due'} by ${instantLabel(data.depositDue.dueAt, tz)}`
              : null}
          </Summary>
        </dl>
      ) : null}
      {data.notes ? (
        <p className="border-t border-border px-5 py-3 text-sm text-text-2">
          <span className="font-medium text-text">Notes:</span> {data.notes}
        </p>
      ) : null}
    </Card>
  )
}

function Summary({
  label,
  value,
  tone,
  children,
}: {
  label: string
  value: string
  tone?: 'amber' | 'rose' | undefined
  children?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] leading-4 font-semibold tracking-[0.05em] text-text-3 uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'num font-medium break-words',
          tone === 'amber' && 'text-am',
          tone === 'rose' && 'text-ro',
        )}
      >
        {value}
      </dd>
      {children ? <dd className="text-sm text-text-3">{children}</dd> : null}
    </div>
  )
}

type Stay = ReservationDetail['stays'][number]

function rateSummary(stay: Stay) {
  const first = stay.nights[0]?.soldPrice ?? '0'
  const varies = stay.nights.some((night) => night.soldPrice !== first)
  if (!varies) return { value: `${naira(first)} /night` }
  const total = stay.nights.reduce((sum, night) => sum.plus(night.soldPrice), dec('0'))
  return { value: `avg ${naira(toAmount(total.dividedBy(stay.nights.length)))} /night` }
}

function NightsCard({ stay, taxesSetUp }: { stay: Stay; taxesSetUp: boolean }) {
  const columns = stay.totals.lines
  const roomHeader =
    stay.terms.mealPlan === 'room_only'
      ? 'Room'
      : stay.terms.mealPlan === 'bed_breakfast'
        ? 'Room & breakfast'
        : 'Room & meals'
  const first = stay.nights[0]
  const discounted = stay.discount && first
  const net = toAmount(stay.nights.reduce((sum, night) => sum.plus(night.net), dec('0')))
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">Rate per night · {stay.terms.planName}</h2>
        <span className="text-sm text-text-3">
          {taxesSetUp
            ? 'Taxes use the rates in force on each night.'
            : "This hotel's taxes aren't set up, so tax lines can't be shown."}
        </span>
      </div>
      {discounted ? (
        <p className="num border-b border-border bg-am-bg px-5 py-2 text-sm text-am">
          Plan price {naira(first.planPrice)} · {stay.discount?.percent}% discount,{' '}
          {stay.discount
            ? stay.discount.reasonText || DISCOUNT_REASON_LABELS[stay.discount.reason]
            : ''}{' '}
          ({stay.discount?.byName})
          {stay.discount?.approverName ? ` · Approved by ${stay.discount.approverName}` : ''}
        </p>
      ) : null}
      {/* Phones: one block per night (ReservationMobile). */}
      <ol className="divide-y divide-border md:hidden">
        {stay.nights.map((night) => (
          <li key={night.date} className="num flex flex-col gap-1 px-5 py-3">
            <span className="flex justify-between gap-3 font-medium">
              <span>{dayLabel(night.date)}</span>
              <span>{naira(night.gross)}</span>
            </span>
            <span className="flex justify-between gap-3 text-sm text-text-2">
              <span>{roomHeader}</span>
              <span>{naira(night.net)}</span>
            </span>
            {night.lines.map((line) => (
              <span key={line.key} className="flex justify-between gap-3 text-sm text-text-3">
                <span>{taxLabel(line)}</span>
                <span>{naira(line.amount)}</span>
              </span>
            ))}
          </li>
        ))}
        <li className="num flex justify-between gap-3 px-5 py-3 font-semibold">
          <span>{nightsLabel(stay.nights.length)}</span>
          <span>{naira(stay.totals.total)}</span>
        </li>
      </ol>
      <table className="w-full border-separate border-spacing-0 text-left max-md:hidden">
        <thead>
          <tr>
            <th scope="col" className={cn(TH, 'pl-5')}>
              Night
            </th>
            <th scope="col" className={cn(TH, 'text-right')}>
              {roomHeader}
            </th>
            {columns.map((line) => (
              <th key={line.key} scope="col" className={cn(TH, 'text-right')}>
                {taxLabel(line)}
              </th>
            ))}
            <th scope="col" className={cn(TH, 'pr-5 text-right')}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {stay.nights.map((night) => (
            <tr key={night.date} className="[&>td]:border-b [&>td]:border-border">
              <td className="num py-2.5 pr-3 pl-5 whitespace-nowrap">{dayLabel(night.date)}</td>
              <td className="num px-3 py-2.5 text-right whitespace-nowrap">{naira(night.net)}</td>
              {columns.map((line) => {
                const found = night.lines.find((l) => l.key === line.key)
                return (
                  <td
                    key={line.key}
                    className="num px-3 py-2.5 text-right whitespace-nowrap text-text-2"
                  >
                    {found ? naira(found.amount) : '—'}
                  </td>
                )
              })}
              <td className="num py-2.5 pr-5 pl-3 text-right font-medium whitespace-nowrap">
                {naira(night.gross)}
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2.5 pr-3 pl-5">{nightsLabel(stay.nights.length)}</td>
            <td className="num px-3 py-2.5 text-right whitespace-nowrap">{naira(net)}</td>
            {columns.map((line) => (
              <td key={line.key} className="num px-3 py-2.5 text-right whitespace-nowrap">
                {naira(line.amount)}
              </td>
            ))}
            <td className="num py-2.5 pr-5 pl-3 text-right whitespace-nowrap">
              {naira(stay.totals.total)}
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  )
}

function GuestCard({ data }: { data: ReservationDetail }) {
  const countries = useCountries()
  const nationality =
    countries?.find((country) => country.code === data.guest.nationality)?.demonym ??
    data.guest.nationality
  return (
    <Card>
      <h2 className="border-b border-border px-5 py-3.5 text-[15px] font-semibold">Guest</h2>
      <dl className="flex flex-col gap-2 px-5 py-4">
        <Line label="Name">
          {[data.guest.title, data.guest.firstName, data.guest.lastName].filter(Boolean).join(' ')}
        </Line>
        <Line label="Nationality">{nationality}</Line>
        <Line label="Phone">{data.guest.phone ? formatPhone(data.guest.phone) : '—'}</Line>
        <Line label="Email" breakAll>
          {data.guest.email ?? '—'}
        </Line>
      </dl>
    </Card>
  )
}

function DepositCard({ data }: { data: ReservationDetail }) {
  const stay = data.stays[0]
  const tz = data.property.timeZone
  return (
    <Card>
      <h2 className="border-b border-border px-5 py-3.5 text-[15px] font-semibold">
        Guarantee and deposit
      </h2>
      <dl className="flex flex-col gap-2 px-5 py-4">
        <Line label="Guarantee">{data.guarantee === 'deposit' ? 'Deposit' : 'None'}</Line>
        <Line label="Deposit rule">
          {stay && data.depositDue ? depositRuleWords(stay.terms.deposit) : 'Not required'}
        </Line>
      </dl>
      <div className="flex flex-col gap-2 px-5 pb-4">
        {stay ? (
          <p className="num rounded-sm bg-surface-2 px-3 py-2 text-sm text-text-2">
            {cancellingNowLine(stay.cancellation, tz)}
          </p>
        ) : null}
      </div>
    </Card>
  )
}

// Values wrap rather than cut off; emails break anywhere.
function Line({
  label,
  breakAll,
  children,
}: {
  label: string
  breakAll?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="flex-none text-text-3">{label}</dt>
      <dd className={cn('num min-w-0 text-right', breakAll ? 'break-all' : 'break-words')}>
        {children}
      </dd>
    </div>
  )
}

// "First night incl. taxes", "30% of the stay incl. taxes", "Paid in full at booking".
function depositRuleWords(rule: ReservationDetail['stays'][number]['terms']['deposit']) {
  return depositBasis(rule, new Date().toISOString(), 'Africa/Lagos').replace(/, by .*$/, '')
}

function ActivityCard({ data, onAudit }: { data: ReservationDetail; onAudit: () => void }) {
  const online = useOnline()
  const tz = data.property.timeZone
  return (
    <Card className="self-start">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">Activity</h2>
        {data.canAudit ? (
          <Button size="sm" className="max-lg:h-11" disabled={!online} onClick={onAudit}>
            Full audit trail
          </Button>
        ) : null}
      </div>
      <ol className="flex flex-col gap-3 px-5 py-4">
        {data.activity.map((entry) => (
          <li key={entry.id} className="flex gap-3">
            <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full bg-pri" />
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">{entry.title}</span>
              {entry.detail ? (
                <span className="num text-sm break-words text-text-2">{entry.detail}</span>
              ) : null}
              <span className="num text-sm text-text-3">
                {entry.actorName ?? 'Vento'} · {instantLabel(entry.at, tz)}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
