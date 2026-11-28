// One reservation (design #5 ReservationDetail, ReservationMobile): who, the stay, what was sold
// night by night with tax lines in force on each night, the deposit and cancellation terms, and what
// happened. Actions: Modify (M), Cancel, More → Mark no-show (brick 6), Copy confirmation (or Copy
// cancellation once ended) and Audit trail; Room move (brick 7); Check in, the registration with
// Reveal and View ID photo, Print registration card and More → Reverse check-in (brick 8).
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
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  ClipboardCopy,
  History,
  LogIn,
  MoreHorizontal,
  Pencil,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AuditSheet } from '@/components/audit/audit-sheet'
import { CheckInSheet } from '@/components/front-desk/check-in-sheet'
import { ReverseDialog, StayRegistration } from '@/components/front-desk/stay-registration'
import { Message } from '@/components/rooms/message'
import { RoomMoveDialog } from '@/components/rooms/room-move-dialog'
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
import { cancellationText, endBanner, NEEDS_CONNECTION } from './change-model'
import { confirmationText } from './confirmation'
import { EndDialog } from './end-dialog'
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
import { ModifyDialog } from './modify-dialog'
import { ReservationsOffline } from './offline-note'
import { PenaltyCard } from './penalty-card'
import { useCountries } from './use-countries'

type Open = 'modify' | 'cancel' | 'no_show' | 'room' | 'check_in' | 'reverse' | null

export function ReservationDetailPage({ id }: { id: string }) {
  // While a waiver is waiting for a manager, the answer shows within seconds.
  const detail = useQuery({
    ...orpc.reservations.get.queryOptions({ input: { id } }),
    refetchInterval: (query) =>
      query.state.data?.penalties.some((p) => p.request?.status === 'pending') ? 5000 : false,
  })
  useScopedTitle(detail.data ? detail.data.number : 'Reservation')
  const [auditing, setAuditing] = useState(false)
  const [open, setOpen] = useState<Open>(null)
  const online = useOnline()
  const canModify = Boolean(detail.data?.actions.modify)
  // M opens Modify (UX standard: keyboard first), unless typing or a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'm' && event.key !== 'M') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog')) return
      if (!canModify || !online || open) return
      event.preventDefault()
      setOpen('modify')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [canModify, online, open])

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
      <Header data={data} onAudit={() => setAuditing(true)} onOpen={setOpen} />
      {/* Activity sits beside the nights only on wide screens, so the nights table never clips. */}
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {data.stays.map((stay) => (
            <NightsCard
              key={stay.id}
              stay={stay}
              taxesSetUp={data.taxesSetUp}
              asBooked={Boolean(data.end)}
            />
          ))}
          {data.stays[0] && data.stays[0].status !== 'confirmed' ? (
            <StayRegistration
              stayId={data.stays[0].id}
              propertyId={data.property.id}
              photoMissing={Boolean(data.stays[0].checkIn?.idPhotoMissing)}
            />
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <GuestCard data={data} />
            {data.end ? <PenaltyCard detail={data} /> : <DepositCard data={data} />}
            {!data.end && data.penalties.length ? <PenaltyCard detail={data} /> : null}
          </div>
        </div>
        <ActivityCard data={data} onAudit={() => setAuditing(true)} />
      </div>
      {open === 'modify' ? <ModifyDialog detail={data} onClose={() => setOpen(null)} /> : null}
      {open === 'room' && data.stays[0] ? (
        <RoomMoveDialog
          stayId={data.stays[0].id}
          version={data.stays[0].version}
          timeZone={data.property.timeZone}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === 'check_in' && data.stays[0] ? (
        <CheckInSheet
          target={{
            stayId: data.stays[0].id,
            propertyId: data.property.id,
            businessDate: data.property.businessDate,
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === 'reverse' && data.stays[0] ? (
        <ReverseDialog
          stayId={data.stays[0].id}
          version={data.stays[0].version}
          guestName={`${data.guest.firstName} ${data.guest.lastName}`}
          roomNumber={data.stays[0].room?.number ?? ''}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === 'cancel' || open === 'no_show' ? (
        <EndDialog detail={data} mode={open} onClose={() => setOpen(null)} />
      ) : null}
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

function Header({
  data,
  onAudit,
  onOpen,
}: {
  data: ReservationDetail
  onAudit: () => void
  onOpen: (open: Open) => void
}) {
  const tz = data.property.timeZone
  const stay = data.stays[0]
  const name = `${data.guest.firstName} ${data.guest.lastName}`
  const online = useOnline()
  const ended = Boolean(data.end)
  const copy = async () => {
    try {
      if (ended) {
        await navigator.clipboard.writeText(cancellationText(data))
        toast.success('Cancellation copied')
        return
      }
      const { text, noTransferAccount } = confirmationText(data)
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
  const banner = endBanner(data)
  const note = blockedNote(data)
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
        <div className="flex flex-col items-end gap-1.5 max-sm:w-full max-sm:items-stretch">
          <div className="flex flex-wrap gap-2">
            {data.actions.cancel ? (
              <Button
                variant="ghost"
                className="text-ro max-lg:h-11"
                disabled={!online}
                onClick={() => onOpen('cancel')}
              >
                <Ban className="size-4" aria-hidden="true" />
                Cancel
              </Button>
            ) : null}
            {data.canAudit ? (
              <Button className="max-lg:h-11" onClick={onAudit}>
                <History className="size-4" aria-hidden="true" />
                Audit trail
              </Button>
            ) : null}
            {data.actions.roomMove && stay ? (
              <Button className="max-lg:h-11" disabled={!online} onClick={() => onOpen('room')}>
                <ArrowLeftRight className="size-4" aria-hidden="true" />
                {stay.room ? 'Room move' : 'Assign room'}
              </Button>
            ) : null}
            {data.actions.checkIn ? (
              <Button variant="primary" className="max-lg:h-11" onClick={() => onOpen('check_in')}>
                <LogIn className="size-4" aria-hidden="true" />
                Check in
              </Button>
            ) : null}
            {data.actions.modify ? (
              <Button className="max-lg:h-11" disabled={!online} onClick={() => onOpen('modify')}>
                <Pencil className="size-4" aria-hidden="true" />
                Modify
                <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">M</kbd>
              </Button>
            ) : null}
            <Button
              variant={data.actions.modify || data.actions.checkIn ? 'default' : 'primary'}
              className="max-lg:h-11"
              onClick={copy}
            >
              <ClipboardCopy className="size-4" aria-hidden="true" />
              {ended ? 'Copy cancellation' : 'Copy confirmation'}
            </Button>
            {data.actions.noShow || data.actions.reverseCheckIn ? (
              <MoreMenu
                disabled={!online}
                onNoShow={data.actions.noShow ? () => onOpen('no_show') : undefined}
                onReverse={data.actions.reverseCheckIn ? () => onOpen('reverse') : undefined}
              />
            ) : null}
          </div>
          {!online && (data.actions.modify || data.actions.cancel || data.actions.noShow) ? (
            <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span>
          ) : data.actions.checkInBlocked ? (
            <span className="text-sm text-text-3">{data.actions.checkInBlocked}</span>
          ) : note ? (
            <span className="text-sm text-text-3">{note}</span>
          ) : null}
        </div>
      </div>
      {banner ? (
        <p
          role="status"
          className="num border-t border-border bg-ro-bg px-5 py-2.5 text-sm break-words text-ro"
        >
          {banner}
        </p>
      ) : null}
      {stay ? (
        <dl className="grid gap-4 border-t border-border px-5 py-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <Summary label="Stay" value={stayRange(stay.arrival, stay.departure)}>
            {nightsLabel(nightsBetweenDates(stay.arrival, stay.departure))} ·{' '}
            {stay.adults === 1 ? '1 adult' : `${stay.adults} adults`}
            {stay.children
              ? ` · ${stay.children === 1 ? '1 child' : `${stay.children} children`}`
              : ''}
          </Summary>
          <Summary label="Room" value={stay.room ? `Room ${stay.room.number}` : 'Not assigned'}>
            {stay.roomTypeName}
            {stay.earlierRooms.length
              ? ` · before: ${stay.earlierRooms.map((r) => `${r.number} (${stayRange(r.from, r.to)})`).join(', ')}`
              : ''}
            {stay.checkIn ? ` · checked in by ${stay.checkIn.byName}` : ''}
          </Summary>
          <Summary label="Rate" value={rate?.value ?? ''}>
            {stay.terms.planName} · {mealLabel(stay.terms).toLowerCase()}
          </Summary>
          <Summary label="Stay total" value={naira(data.quotedTotal)}>
            incl. service charge &amp; taxes
          </Summary>
          {ended ? (
            <Summary label="Deposit" value="—">
              No longer due
            </Summary>
          ) : (
            <Summary
              label="Deposit"
              value={data.depositDue ? naira(data.depositDue.amount) : 'Not required'}
              tone={data.depositDue ? (isOverdue(data.depositDue) ? 'rose' : 'amber') : undefined}
            >
              {data.depositDue
                ? `${isOverdue(data.depositDue) ? 'overdue, was due' : 'due'} by ${instantLabel(data.depositDue.dueAt, tz)}`
                : null}
            </Summary>
          )}
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

function NightsCard({
  stay,
  taxesSetUp,
  asBooked,
}: {
  stay: Stay
  taxesSetUp: boolean
  asBooked: boolean
}) {
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
  // All-in plans (the default, decision 0032) read price first, then what's inside it.
  const inside = stay.terms.pricesIncludeTaxes
  const muted = inside ? 'text-text-3' : ''
  const totalHead = inside ? 'Price' : 'Total'
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">
          Rate per night · {asBooked ? 'as booked' : stay.terms.planName}
        </h2>
        <span className="text-sm text-text-3">
          {!taxesSetUp
            ? "This hotel's taxes aren't set up, so tax lines can't be shown."
            : inside
              ? 'Prices include taxes and service charge, at the rates in force on each night.'
              : 'Taxes are added on top, at the rates in force on each night.'}
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
              <span>{inside ? `Includes ${roomHeader.toLowerCase()}` : roomHeader}</span>
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
            {inside ? (
              <th scope="col" className={cn(TH, 'text-right')}>
                {totalHead}
              </th>
            ) : null}
            <th scope="col" className={cn(TH, 'text-right')}>
              {inside ? `Includes ${roomHeader.toLowerCase()}` : roomHeader}
            </th>
            {columns.map((line) => (
              <th key={line.key} scope="col" className={cn(TH, 'text-right')}>
                {taxLabel(line)}
              </th>
            ))}
            {inside ? null : (
              <th scope="col" className={cn(TH, 'pr-5 text-right')}>
                {totalHead}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {stay.nights.map((night) => (
            <tr key={night.date} className="[&>td]:border-b [&>td]:border-border">
              <td className="num py-2.5 pr-3 pl-5 whitespace-nowrap">{dayLabel(night.date)}</td>
              {inside ? (
                <td className="num px-3 py-2.5 text-right font-medium whitespace-nowrap">
                  {naira(night.gross)}
                </td>
              ) : null}
              <td className={cn('num px-3 py-2.5 text-right whitespace-nowrap', muted)}>
                {naira(night.net)}
              </td>
              {columns.map((line) => {
                const found = night.lines.find((l) => l.key === line.key)
                return (
                  <td
                    key={line.key}
                    className={cn(
                      'num px-3 py-2.5 text-right whitespace-nowrap',
                      inside ? 'text-text-3' : 'text-text-2',
                      inside && line.key === columns.at(-1)?.key && 'pr-5',
                    )}
                  >
                    {found ? naira(found.amount) : '—'}
                  </td>
                )
              })}
              {inside ? null : (
                <td className="num py-2.5 pr-5 pl-3 text-right font-medium whitespace-nowrap">
                  {naira(night.gross)}
                </td>
              )}
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2.5 pr-3 pl-5">{nightsLabel(stay.nights.length)}</td>
            {inside ? (
              <td className="num px-3 py-2.5 text-right whitespace-nowrap">
                {naira(stay.totals.total)}
              </td>
            ) : null}
            <td className={cn('num px-3 py-2.5 text-right whitespace-nowrap', muted)}>
              {naira(net)}
            </td>
            {columns.map((line) => (
              <td
                key={line.key}
                className={cn(
                  'num px-3 py-2.5 text-right whitespace-nowrap',
                  muted,
                  inside && line.key === columns.at(-1)?.key && 'pr-5',
                )}
              >
                {naira(line.amount)}
              </td>
            ))}
            {inside ? null : (
              <td className="num py-2.5 pr-5 pl-3 text-right whitespace-nowrap">
                {naira(stay.totals.total)}
              </td>
            )}
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

// Where Modify and Cancel would be, why they aren't: "This booking was cancelled on 25 Nov 2026." /
// "Arrival was 24 Nov 2026. Mark it as a no-show."
function blockedNote(data: ReservationDetail): string | null {
  if (!data.actions.canManage) return null
  if (data.end) {
    const on = dateLabel(instantDate(data.end.at, data.property.timeZone))
    return data.end.kind === 'cancelled'
      ? `This booking was cancelled on ${on}.`
      : `This booking was marked no-show on ${on}.`
  }
  if (data.actions.blocked === 'arrival_passed') {
    return `Arrival was ${dateLabel(data.stays[0]?.arrival ?? data.bookedOnBusinessDate)}. Mark it as a no-show.`
  }
  return null
}

// More: Mark no-show (design header ⋯ "More: no-show, duplicate, print"; only no-show is built).
function MoreMenu({
  disabled,
  onNoShow,
  onReverse,
}: {
  disabled: boolean
  onNoShow: (() => void) | undefined
  onReverse: (() => void) | undefined
}) {
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={menu} className="relative">
      <Button
        size="icon"
        aria-label={onReverse ? 'More: reverse check-in' : 'More: no-show'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-[var(--shadow-lg)]"
        >
          {onNoShow ? (
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              className="flex h-11 w-full items-center px-3 text-left font-medium hover:bg-surface-2 disabled:opacity-45"
              onClick={() => {
                setOpen(false)
                onNoShow()
              }}
            >
              Mark no-show
            </button>
          ) : null}
          {onReverse ? (
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              className="flex h-11 w-full items-center px-3 text-left font-medium text-ro hover:bg-surface-2 disabled:opacity-45"
              onClick={() => {
                setOpen(false)
                onReverse()
              }}
            >
              Reverse check-in
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
