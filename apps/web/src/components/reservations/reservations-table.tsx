// The Reservations table (DSComponents: "Table · the one list pattern"): Guest, Booking, Stay, Room,
// How they booked, Status, Deposit, Total; Hotel first under All hotels. The whole row opens the
// reservation (keyboards use the guest's link). Below md each row is a card.
import { Link } from '@tanstack/react-router'
import { type ReservationRow, SOURCE_LABELS } from '@vento/shared'
import { ChevronRight } from 'lucide-react'
import { TD, TH } from '@/components/settings/table-styles'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { depositShort, naira, statusLabel, statusTone, stayLine } from './format'

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
            Room
          </th>
          <th scope="col" className={TH}>
            How they booked
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

function Row({ row, showHotel }: { row: ReservationRow; showHotel: boolean }) {
  const open = (
    <Link
      to="/reservations/$reservationId"
      params={{ reservationId: row.id }}
      search={{ hotel: row.propertyId }}
      className="flex min-h-11 min-w-0 items-center gap-2 font-medium group-hover/row:text-pri-ink md:min-h-0"
    >
      <span className="truncate" title={row.guestName}>
        {row.guestName}
      </span>
      <ChevronRight className="ml-auto size-4 flex-none text-text-3 md:hidden" aria-hidden="true" />
    </Link>
  )
  return (
    <tr
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) return
        event.currentTarget.querySelector('a')?.click()
      }}
      className="group/row cursor-pointer hover:bg-surface-2/60 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-4 max-md:gap-y-1 max-md:px-4 max-md:py-3 md:[&>td]:border-b md:[&>td]:border-border md:last:[&>td]:border-0"
    >
      {showHotel ? (
        <td className={cn(TD, 'pl-5 text-text-2 max-md:basis-full max-md:text-sm')}>
          {row.propertyName}
        </td>
      ) : null}
      <td className={cn(TD, 'max-w-56 max-md:max-w-full max-md:basis-full', !showHotel && 'pl-5')}>
        <span className="flex min-w-0 flex-col gap-0.5">
          {open}
          {row.foreign ? <span className="text-xs text-text-3">Foreign national</span> : null}
        </span>
      </td>
      <td className={cn(TD, 'num whitespace-nowrap text-text-2')}>{row.number}</td>
      <td className={cn(TD, 'num whitespace-nowrap')}>{stayLine(row.arrival, row.departure)}</td>
      <td className={cn(TD, 'text-text-2 max-md:hidden')}>
        <span className="block">{row.roomTypeName}</span>
        <span className="block text-sm text-text-3">Not assigned</span>
      </td>
      <td className={cn(TD, 'text-text-2 max-md:hidden')}>{SOURCE_LABELS[row.source]}</td>
      <td className={TD}>
        <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
      </td>
      <td className={cn(TD, 'num whitespace-nowrap max-md:hidden')}>
        {row.depositDue ? (
          <span className="text-am">{depositShort(row.depositDue)}</span>
        ) : (
          <span className="text-text-3">—</span>
        )}
      </td>
      <td className={cn(TD, 'num pr-5 text-right whitespace-nowrap max-md:ml-auto')}>
        {naira(row.total)}
      </td>
    </tr>
  )
}
