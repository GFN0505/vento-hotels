// A bar's card (spec: "Click on a bar opens a small card"): guest, reservation number, type, plan,
// dates, room and deposit due, with Open reservation, Check in (C) for today's arrivals, Room move
// (M), Modify (E) and Print registration card for a guest in house (brick 8).
import { Link } from '@tanstack/react-router'
import {
  type ChartStay,
  formatMoney,
  nightsBetween,
  rangeLabel,
  type TapeChart,
} from '@vento/shared'
import { ArrowLeftRight, ExternalLink, LogIn, Pencil, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { printPdf } from '@/components/front-desk/print-card'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { type Anchor, Popover } from './popover'

type Props = {
  chart: TapeChart
  stay: ChartStay
  anchor: Anchor
  online: boolean
  onClose: () => void
  onMove: () => void
  onModify: () => void
  // Opens the check-in sheet (today's arrivals, for those who check guests in).
  onCheckIn?: (() => void) | undefined
}

export function StayCard({
  chart,
  stay,
  anchor,
  online,
  onClose,
  onMove,
  onModify,
  onCheckIn,
}: Props) {
  const type = chart.roomTypes.find((t) => t.id === stay.roomTypeId)
  const room = chart.rooms.find((r) => r.id === stay.roomId)
  const nights = nightsBetween(stay.arrival, stay.departure)
  const canMove = chart.can.move && stay.movable
  const canModify = chart.can.manage && stay.movable
  return (
    <Popover anchor={anchor} label={`${stay.guestName} · ${stay.number}`} onClose={onClose}>
      <div className="flex flex-col gap-0.5">
        <span className="text-md font-semibold">
          {stay.guestName} <span className="num font-normal text-text-3">· {stay.number}</span>
        </span>
        <span className="num text-sm text-text-2">
          {type?.name} · {stay.planName} · {rangeLabel(stay.arrival, stay.departure, true)} ·{' '}
          {nights === 1 ? '1 night' : `${nights} nights`} ·{' '}
          {room ? `Room ${room.number}` : 'Not assigned'}
        </span>
        {stay.depositDue ? (
          <span className="num text-sm text-am">
            Deposit due {formatMoney({ amount: stay.depositDue.amount, currency: 'NGN' })}
          </span>
        ) : null}
        {stay.status === 'checked_in' ? (
          <span className="text-sm font-medium text-text-2">In house</span>
        ) : null}
        {!stay.movable && stay.arrival < chart.hotel.businessDate && stay.status === 'confirmed' ? (
          <span className="text-sm text-text-3">Arrival has passed: mark it as a no-show.</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {chart.can.open ? (
          <Link
            to="/reservations/$reservationId"
            params={{ reservationId: stay.reservationId }}
            search={{ hotel: chart.hotel.id }}
            data-autofocus
            className="inline-flex h-11 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 font-medium hover:bg-surface-2 lg:h-8"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Open reservation
          </Link>
        ) : null}
        {onCheckIn && stay.status === 'confirmed' && stay.arrival === chart.hotel.businessDate ? (
          <Button
            variant="primary"
            className="max-lg:h-11"
            disabled={!online && !stay.roomId}
            onClick={onCheckIn}
          >
            <LogIn className="size-4" aria-hidden="true" />
            Check in
            <kbd className="ml-1 hidden rounded-[4px] bg-white/20 px-1.5 text-xs lg:inline">C</kbd>
          </Button>
        ) : null}
        {onCheckIn && stay.status === 'checked_in' ? (
          <Button
            className="max-lg:h-11"
            disabled={!online}
            onClick={() =>
              void api.documents
                .registrationCard({ stayId: stay.id })
                .then((card) => printPdf(card.url))
                .catch((error: unknown) => toast.error(problemMessage(error)))
            }
          >
            <Printer className="size-4" aria-hidden="true" />
            Print registration card
          </Button>
        ) : null}
        {canMove ? (
          <Button className="max-lg:h-11" disabled={!online} onClick={onMove}>
            <ArrowLeftRight className="size-4" aria-hidden="true" />
            {room ? 'Room move' : 'Assign room'}
            <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">M</kbd>
          </Button>
        ) : null}
        {canModify ? (
          <Button className="max-lg:h-11" disabled={!online} onClick={onModify}>
            <Pencil className="size-4" aria-hidden="true" />
            Modify
            <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">E</kbd>
          </Button>
        ) : null}
      </div>
      {!online && (canMove || canModify) ? (
        <span className="text-sm text-text-3">Moving rooms needs a connection.</span>
      ) : null}
    </Popover>
  )
}
