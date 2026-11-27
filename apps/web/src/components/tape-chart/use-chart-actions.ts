// What the chart and the day list do: assign, move or remove a room (with Undo), and Mark clean /
// Mark dirty (with Undo, and through the outbox when Vento can't be reached). Moves to another room
// type, extensions and out of order have their own dialogs and popovers.
import { useQueryClient } from '@tanstack/react-query'
import {
  type AssignRoomInput,
  type ChartRoom,
  type ChartStay,
  newId,
  type TapeChart,
  UNDO_SECONDS,
} from '@vento/shared'
import { toast } from 'sonner'
import { api, orpc } from '@/lib/api'
import { errorCode, isConnectionProblem, problemMessage } from '@/lib/errors'
import { isOnline, markUnreachable } from '@/offline/connection'
import { enqueue } from '@/offline/outbox'

export const MOVE_NEEDS_LIVE = 'Moving rooms needs a connection.'
export const OOO_NEEDS_LIVE = 'Out of order needs a connection.'

export function useChartActions(chart: TapeChart | undefined, memberId: string | undefined) {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.reservations.key() }),
    ])
  const numberOf = (roomId: string | null) =>
    roomId ? chart?.rooms.find((room) => room.id === roomId)?.number : undefined

  async function assign(
    stay: Pick<ChartStay, 'id' | 'version' | 'guestName' | 'roomId'>,
    roomId: string | null,
    extra: Partial<Pick<AssignRoomInput, 'reason' | 'reasonText' | 'source'>> = {},
  ): Promise<boolean> {
    try {
      const done = await api.stays.assignRoom({
        idempotencyKey: newId(),
        stayId: stay.id,
        version: stay.version,
        roomId,
        ...extra,
      })
      await refresh()
      const message = done.room
        ? done.previous
          ? `${done.guestName} moved to ${done.room.number}`
          : `${done.guestName} assigned to ${done.room.number}`
        : `Room removed from ${done.guestName}`
      // Undo puts the stay back where it was, if that room is still free.
      toast.success(message, {
        duration: UNDO_SECONDS * 1000,
        action: {
          label: 'Undo',
          onClick: () =>
            void assign(
              {
                id: done.stayId,
                version: done.version,
                guestName: done.guestName,
                roomId: done.room?.id ?? null,
              },
              done.previous?.id ?? null,
              { source: 'undo' },
            ),
        },
      })
      return true
    } catch (error) {
      toast.error(problemMessage(error))
      const code = errorCode(error)
      if (code === 'ROOM_TAKEN' || code === 'RESERVATION_CHANGED' || code === 'ROOM_OUT_OF_ORDER') {
        await refresh()
      }
      return false
    }
  }

  async function setStatus(
    room: Pick<ChartRoom, 'id' | 'number' | 'status'>,
    status: 'clean' | 'dirty',
    source: 'chart' | 'day_list' | 'undo' = 'chart',
    undoTo?: 'clean' | 'dirty',
  ) {
    if (!chart || !memberId) return
    const input = {
      idempotencyKey: newId(),
      propertyId: chart.hotel.id,
      roomId: room.id,
      status,
      occurredAt: new Date().toISOString(),
      source,
    }
    const label = `${room.number} marked ${status}`
    const queue = async () => {
      await enqueue({ kind: 'rooms.setStatus', input, memberId, label })
      toast.success(`${label} · Will sync`)
    }
    if (!isOnline()) return queue()
    try {
      const result = await api.rooms.setStatus(input)
      await refresh()
      if (result.outcome === 'superseded') {
        toast.message(result.message ?? `${room.number} kept as ${result.status}`)
        return
      }
      // Undo puts back the status it had (inspected comes back as clean: only inspections set it).
      const back = undoTo ?? (room.status === 'dirty' ? 'dirty' : 'clean')
      toast.success(label, {
        duration: UNDO_SECONDS * 1000,
        action:
          source === 'undo'
            ? undefined
            : {
                label: 'Undo',
                onClick: () => void setStatus({ ...room, status }, back, 'undo', status),
              },
      })
    } catch (error) {
      if (isConnectionProblem(error as { status?: number })) {
        markUnreachable()
        return queue()
      }
      toast.error(problemMessage(error))
    }
  }

  return { assign, setStatus, refresh, numberOf }
}
