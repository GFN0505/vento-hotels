// The Reservations table (DSComponents: "Table · the one list pattern"): Guest (with how they booked
// and Foreign national underneath), Booking, Stay (with the room type), Status, Deposit, Total; Hotel
// first under All hotels. Compact enough that Total shows at 1280px without scrolling. The whole row
// opens the reservation (keyboards use the guest's link). Below md each row is a card.
import { Link } from '@tanstack/react-router'
import { type ReservationRow, SOURCE_LABELS } from '@vento/shared'
import { ChevronRight } from 'lucide-react'
import { TD, TH } from '@/components/settings/table-styles'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { depositShort, isOverdue, naira, statusLabel, statusTone, stayLine } from './format'

type Props = { rows: readonly ReservationRow[]; showHotel: boolean; dimmed: boolean }

export function ReservationsTable({ rows, showHotel, dimmed }: Props) {
  return (
    <table
      className={cn(
        'w-full border-separate border-spacing-0 text-left transition-opacity max-md:block',
        dimmed && 'opacity-60',
      )}
    >
      <thead className="max-md:sr-only">
        <tr>
          {showHotel ? (
            <th scope="col" className={cn(TH, 'pl-5')}>
              Hotel
            </th>
          ) : null}
          <th scope="col" className={cn(TH, !showHotel && 'pl-5')}>
            Guest
          </th>
          <th scope="col" className={TH}>
            Booking
          </th>
          <th scope="col" className={TH}>
            Stay
          </th>
          <th scope="col" className={TH}>
            Status
          </th>
          <th scope="col" className={TH}>
            Deposit
          </th>
          <th scope="col" className={cn(TH, 'pr-5 text-right')}>
            Total
          </th>
        </tr>
      </thead>
      <tbody className="max-md:block max-md:divide-y max-md:divide-border">
        {rows.map((row) => (
          <Row key={row.id} row={row} showHotel={showHotel} />
        ))}
      </tbody>
    </table>
  )
}

// Cancelled and no-show rows: what is owed, not the stay's price ("₦257,250.00 penalty", "Waived",
// "No penalty"); no deposit is due on them.
export function endedTotal(row: Pick<ReservationRow, 'status' | 'penalty'>): string | null {
  if (row.status !== 'cancelled' && row.status !== 'no_show') return null
  if (!row.penalty) return 'No penalty'
  return row.penalty.waived ? 'Waived' : `${naira(row.penalty.amount)} penalty`
}

function Row({ row, showHotel }: { row: ReservationRow; showHotel: boolean }) {
  const ended = endedTotal(row)
  const sub = [SOURCE_LABELS[row.source], row.foreign ? 'Foreign national' : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <tr
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) return
        event.currentTarget.querySelector('a')?.click()
      }}
      className="group/row cursor-pointer hover:bg-surface-2/60 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-4 max-md:gap-y-1 max-md:px-4 max-md:py-3 md:[&>td]:border-b md:[&>td]:border-border md:last:[&>td]:border-0"
    >
      {showHotel ? (
        <td
          className={cn(TD, 'pl-5 whitespace-nowrap text-text-2 max-md:basis-full max-md:text-sm')}
        >
          {row.propertyName}
        </td>
      ) : null}
      <td className={cn(TD, 'max-w-52 max-md:max-w-full max-md:basis-full', !showHotel && 'pl-5')}>
        <span className="flex min-w-0 flex-col">
          <Link
            to="/reservations/$reservationId"
            params={{ reservationId: row.id }}
            search={{ hotel: row.propertyId }}
            className="flex min-h-11 min-w-0 items-center gap-2 font-medium group-hover/row:text-pri-ink md:min-h-0"
          >
            <span className="truncate" title={row.guestName}>
              {row.guestName}
            </span>
            <ChevronRight
              className="ml-auto size-4 flex-none text-text-3 md:hidden"
              aria-hidden="true"
            />
          </Link>
          <span className="truncate text-sm text-text-3">{sub}</span>
        </span>
      </td>
      <td className={cn(TD, 'num whitespace-nowrap text-text-2 max-md:text-sm')}>{row.number}</td>
      <td className={cn(TD, 'whitespace-nowrap max-md:basis-full')}>
        <span className="num block">{stayLine(row.arrival, row.departure)}</span>
        <span className="block text-sm text-text-3">{row.roomTypeName}</span>
      </td>
      <td className={TD}>
        <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
      </td>
      <td className={cn(TD, 'whitespace-nowrap')}>
        {row.depositDue && !ended ? (
          <StatusBadge tone={isOverdue(row.depositDue) ? 'rose' : 'amber'} className="num">
            {depositShort(row.depositDue)}
          </StatusBadge>
        ) : (
          <span className="text-text-3 max-md:hidden">—</span>
        )}
      </td>
      <td
        className={cn(
          TD,
          'num pr-5 text-right whitespace-nowrap max-md:ml-auto max-md:font-medium',
        )}
      >
        {ended ? <span className="text-text-2">{ended}</span> : naira(row.total)}
      </td>
    </tr>
  )
}
