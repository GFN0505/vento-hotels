// The drag-to-extend (or shorten) popover (design #3: "Extend James Whitfield to 30 Nov?"; spec:
// "Drag to extend or shorten"). On release it asks brick 6's quoteChange with the stay's room, and
// shows the new nights (or those dropped), their tax lines, what it adds or takes off, the
// late-change penalty, and whether the room is free. Extend stay saves through reservations.modify
// with the hash shown; nothing is saved when the room isn't free.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ChangeQuote,
  type ChartStay,
  dec,
  formatMoney,
  formatRateDate,
  newId,
  nightsBetween,
  rangeLabel,
  type TapeChart,
  toAmount,
} from '@vento/shared'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FigureBox } from '@/components/reservations/change-parts'
import { Button } from '@/components/ui/button'
import { api, orpc } from '@/lib/api'
import { errorCode, isConnectionProblem, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { type Anchor, Popover } from './popover'

const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })

type Props = {
  chart: TapeChart
  stay: ChartStay
  departure: string
  anchor: Anchor
  onClose: () => void
  onMove: () => void
  onModify: () => void
}

// The figures for the nights added or dropped: count × price, the tax lines summed, and the change.
export function extendFigures(q: ChangeQuote, before: { departure: string }) {
  const longer = q.nights.length > q.nightsBefore
  const fresh = q.nights.filter((night) => !night.kept)
  const first = fresh[0]
  const lines = new Map<string, { name: string; ratePercent: string; amount: string }>()
  for (const night of fresh) {
    for (const line of night.lines) {
      const sum = lines.get(line.key)
      lines.set(line.key, {
        name: line.name,
        ratePercent: line.ratePercent,
        amount: toAmount(dec(sum?.amount ?? '0').plus(line.amount)),
      })
    }
  }
  const room = fresh.reduce((sum, night) => sum.plus(night.net), dec('0'))
  const count = longer ? fresh.length : q.nightsBefore - q.nights.length
  return {
    longer,
    nightsLine:
      longer && first
        ? `${count === 1 ? '1 night' : `${count} nights`} × ${naira(first.soldPrice)}`
        : null,
    room: toAmount(room),
    lines: [...lines.values()],
    total: `${q.difference.sign < 0 ? '−' : '+'}${naira(q.difference.amount)}`,
    totalLabel: q.difference.sign < 0 ? 'Taken off the stay' : 'Added to stay',
    before: before.departure,
  }
}

export function ExtendPopover({
  chart,
  stay,
  departure,
  anchor,
  onClose,
  onMove,
  onModify,
}: Props) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const key = useRef(newId())
  const [failure, setFailure] = useState<string>()
  const [retrying, setRetrying] = useState(false)
  const fields = {
    reservationId: stay.reservationId,
    stayId: stay.id,
    version: stay.version,
    arrival: stay.arrival,
    departure,
    roomTypeId: stay.roomTypeId,
    adults: stay.adults,
    children: stay.children,
    // A stay with a room keeps it, or nothing is saved (spec: "Room not free on the new nights").
    ...(stay.roomId ? { roomId: stay.roomId } : {}),
  }
  const quote = useQuery({
    ...orpc.reservations.quoteChange.queryOptions({ input: fields }),
    enabled: online,
    retry: false,
    staleTime: 0,
  })
  const q = quote.data
  const save = useMutation({
    mutationFn: () =>
      api.reservations.modify({
        idempotencyKey: key.current,
        ...fields,
        changeHash: q?.changeHash ?? '',
        source: 'tape_chart',
      }),
  })
  const longer = departure > stay.departure
  const nights = nightsBetween(stay.arrival, departure)
  const before = nightsBetween(stay.arrival, stay.departure)
  const room = chart.rooms.find((r) => r.id === stay.roomId)
  const roomBusy = q?.room && !q.room.free
  const overLimit = Boolean(q?.discount && !q.discount.within)
  const figures = q ? extendFigures(q, stay) : null

  const submit = async () => {
    if (!q || roomBusy || overLimit || !online || save.isPending) return
    setFailure(undefined)
    try {
      await save.mutateAsync()
      setRetrying(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.reservations.key() }),
      ])
      onClose()
      toast.success(
        `${stay.guestName} ${longer ? 'extended' : 'shortened'} to ${formatRateDate(departure, false)}`,
      )
    } catch (error) {
      if (isConnectionProblem(error as { status?: number })) {
        setRetrying(true)
        return
      }
      key.current = newId()
      setRetrying(false)
      setFailure(problemMessage(error))
      const code = errorCode(error)
      if (code === 'PRICE_CHANGED' || code === 'ROOM_TAKEN' || code === 'SOLD_OUT')
        void quote.refetch()
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the connection returns.
  useEffect(() => {
    if (online && retrying) void submit()
  }, [online])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('button, a, input, textarea')) return
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault()
        void submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const title = `${longer ? 'Extend' : 'Shorten'} ${stay.guestName} to ${formatRateDate(departure, false)}?`
  return (
    <Popover
      anchor={anchor}
      label={title}
      onClose={onClose}
      className="w-[min(380px,calc(100vw-24px))]"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-md font-semibold">{title}</span>
        <span className="num text-sm text-text-2">
          {room ? `Room ${room.number} · ` : ''}
          {rangeLabel(stay.arrival, departure, true)} ·{' '}
          {nights === 1 ? '1 night' : `${nights} nights`} (was {before})
        </span>
      </div>
      {retrying ? (
        <p role="status" className="rounded-sm bg-bl-bg px-3 py-2 text-sm text-bl">
          Checking whether {stay.guestName} was {longer ? 'extended' : 'shortened'}…
        </p>
      ) : null}
      {!online ? (
        <p className="text-sm text-text-3">Moving rooms needs a connection.</p>
      ) : quote.isPending ? (
        <div
          className="h-24 animate-pulse rounded-md bg-surface-2"
          role="status"
          aria-label="Pricing the new nights"
        />
      ) : quote.isError ? (
        <p role="alert" className="text-sm text-ro">
          {problemMessage(quote.error)}
        </p>
      ) : q && figures ? (
        <>
          <FigureBox
            rows={[
              ...(figures.nightsLine
                ? [{ label: `${figures.nightsLine} · ${q.planName}`, value: naira(figures.room) }]
                : []),
              ...figures.lines.map((line) => ({
                label: `${line.name} ${line.ratePercent}%`,
                value: naira(line.amount),
              })),
              { label: figures.totalLabel, value: figures.total, strong: true },
            ]}
          />
          {q.latePenalty ? (
            <p className="text-sm text-am">
              Free cancellation has ended, so a late-change penalty of {naira(q.latePenalty.amount)}{' '}
              applies.
            </p>
          ) : null}
          {roomBusy && room && q.room?.blockedOn ? (
            <p role="alert" className="text-sm text-ro">
              Room {room.number} is{' '}
              {q.room.blockedBy === 'Out of order' ? 'out of order' : 'booked'} from{' '}
              {formatRateDate(q.room.blockedOn, false)}
              {q.room.blockedBy && q.room.blockedBy !== 'Out of order'
                ? ` (${q.room.blockedBy})`
                : ''}
              . Move the stay to a free room first, or extend in Modify and leave it unassigned.
            </p>
          ) : overLimit ? (
            <p className="text-sm text-am">
              The stay's {q.existingDiscount?.percent ?? q.discount?.percent}% discount on the new
              nights is over your limit. Open Modify to ask for approval or price them without it.
            </p>
          ) : longer ? (
            <p className="text-sm text-text-2">
              {room
                ? `Room ${room.number} is free ${nights - before === 2 ? 'both nights' : nights - before === 1 ? 'that night' : 'every night'}. `
                : ''}
              Same plan, no approval needed.
            </p>
          ) : null}
          {failure ? (
            <p role="alert" className="text-sm text-ro">
              {failure}
            </p>
          ) : null}
        </>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {roomBusy ? (
          <Button className="mr-auto max-lg:h-11" onClick={onMove}>
            Room move
          </Button>
        ) : overLimit ? (
          <Button className="mr-auto max-lg:h-11" onClick={onModify}>
            Open Modify
          </Button>
        ) : null}
        <Button variant="ghost" className="max-lg:h-11" onClick={onClose}>
          Cancel <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">esc</kbd>
        </Button>
        <Button
          variant="primary"
          className="max-lg:h-11"
          data-autofocus
          disabled={!online || !q || Boolean(roomBusy) || overLimit}
          loading={save.isPending}
          onClick={() => void submit()}
        >
          {longer ? 'Extend stay' : 'Shorten stay'}
          <kbd className="ml-1 text-xs opacity-80 max-lg:hidden">↵</kbd>
        </Button>
      </div>
    </Popover>
  )
}
