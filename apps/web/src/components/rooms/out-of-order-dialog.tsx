// Out of order (spec: "Out of order"; a pattern from the design's dialogs): put a room out of order
// for dates with a reason, change an upcoming or current period's dates, put a room back in service
// (it comes back dirty or clean) or remove an upcoming period. The checks run as the dates change
// and again on the server under lock: a booking in the room, a night that would go short, an
// overlap. Every change is recorded with the person's name.
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDays,
  formatRateDate,
  newId,
  nightsBetween,
  OOO_NOTE_MAX,
  OOO_REASON_LABELS,
  OOO_REASONS,
  type OutOfOrderReason,
  type OutOfOrderView,
  rangeLabel,
} from '@vento/shared'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Pills, TextArea, useDialogLeaveGuard } from '@/components/reservations/change-parts'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'

export const OOO_NEEDS_LIVE = 'Out of order needs a connection.'
const REASONS = OOO_REASONS.map((value) => ({ value, label: OOO_REASON_LABELS[value] }))

type Props = {
  propertyId: string
  businessDate: string
  room: { id: string; number: string; typeName: string }
  // Changing or ending this period; creating one when left out.
  period?: OutOfOrderView | undefined
  mode: 'create' | 'change' | 'end'
  onClose: () => void
  // "Move Emeka Kalu": opens Room move for the stay in the way.
  onMoveStay?: (stayId: string) => void
}

function useSettled<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

const nightsWords = (n: number) => (n === 1 ? '1 night' : `${n} nights`)

export function OutOfOrderDialog(props: Props) {
  const { propertyId, businessDate, room, period, mode, onClose } = props
  const online = useOnline()
  const queryClient = useQueryClient()
  const key = useRef(newId())
  const current = Boolean(period && period.from < businessDate)
  const [from, setFrom] = useState(period?.from ?? businessDate)
  const [back, setBack] = useState(period?.backInService ?? addDays(businessDate, 1))
  const [reason, setReason] = useState<OutOfOrderReason | undefined>(period?.reason)
  const [reasonText, setReasonText] = useState('')
  const [note, setNote] = useState('')
  const [why, setWhy] = useState('')
  const [comesBack, setComesBack] = useState<'dirty' | 'clean'>('dirty')
  const [failure, setFailure] = useState<string>()
  const [tried, setTried] = useState(false)
  const leaveBar = useDialogLeaveGuard(() => undefined)

  const nights = back > from ? nightsBetween(from, back) : 0
  const dates = useSettled(JSON.stringify({ from, back }))
  const asked = JSON.parse(dates) as { from: string; back: string }
  const checking = mode !== 'end' && asked.back > asked.from && online
  const check = useQuery({
    ...orpc.rooms.outOfOrder.check.queryOptions({
      input: checking
        ? {
            propertyId,
            roomId: room.id,
            from: asked.from,
            backInService: asked.back,
            ...(period ? { periodId: period.id } : {}),
          }
        : skipToken,
    }),
    retry: false,
    staleTime: 0,
  })
  const result = check.data
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.reservations.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.rooms.key() }),
    ])

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return api.rooms.outOfOrder.create({
          idempotencyKey: key.current,
          propertyId,
          roomId: room.id,
          from,
          backInService: back,
          reason: reason ?? 'other',
          ...(reason === 'other' ? { reasonText: reasonText.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        })
      }
      if (!period) throw new Error('No out-of-order period')
      if (mode === 'change') {
        return api.rooms.outOfOrder.change({
          idempotencyKey: key.current,
          periodId: period.id,
          version: period.version,
          from,
          backInService: back,
          changeReason: why.trim(),
        })
      }
      return api.rooms.outOfOrder.end({
        idempotencyKey: key.current,
        periodId: period.id,
        version: period.version,
        status: comesBack,
        changeReason: why.trim(),
      })
    },
  })

  const problems = {
    reason: mode === 'create' && !reason ? 'Pick a reason.' : undefined,
    reasonText:
      mode === 'create' && reason === 'other' && !reasonText.trim() ? 'Say what it is.' : undefined,
    why: mode !== 'create' && why.trim().length < 3 ? 'Say why, in a few words.' : undefined,
  }
  const blocked = mode !== 'end' && Boolean(result?.problem)

  const submit = async () => {
    setTried(true)
    if (!online || save.isPending) return
    if (Object.values(problems).some(Boolean) || blocked || (mode !== 'end' && nights < 1)) return
    setFailure(undefined)
    try {
      const saved = await save.mutateAsync()
      key.current = newId()
      await refresh()
      onClose()
      toast.success(
        mode === 'create'
          ? `${room.number} out of order until ${formatRateDate(saved.backInService, false)}`
          : mode === 'change'
            ? 'Out-of-order dates changed'
            : saved.status === 'removed'
              ? `Out of order removed from ${room.number}`
              : `${room.number} back in service`,
      )
    } catch (error) {
      key.current = newId()
      setFailure(problemMessage(error))
      void check.refetch()
    }
  }

  const title =
    mode === 'create'
      ? `Put ${room.number} out of order`
      : mode === 'change'
        ? `Change out-of-order dates · ${room.number}`
        : current || period?.from === businessDate
          ? `Put ${room.number} back in service today?`
          : `Remove the out-of-order for ${period ? rangeLabel(period.from, period.backInService) : ''}?`
  const primary =
    mode === 'create'
      ? `Put out of order · ${nightsWords(nights)}`
      : mode === 'change'
        ? 'Change dates'
        : current || period?.from === businessDate
          ? 'Back in service'
          : 'Remove'
  const blocker = result?.blockers[0]
  const leftLine = leftWords(result?.left ?? [], result?.roomTypeName ?? room.typeName)

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={`${room.typeName}${period ? ` · now ${rangeLabel(period.from, period.backInService, true)}` : ''}`}
      className="max-w-[560px]"
      footer={
        leaveBar ?? (
          <div className="flex w-full flex-col gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
              {!online ? (
                <span className="mr-auto text-sm text-text-3" role="status">
                  {OOO_NEEDS_LIVE}
                </span>
              ) : null}
              <Button variant="ghost" onClick={onClose}>
                Cancel <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">esc</kbd>
              </Button>
              <Button
                variant={
                  mode === 'end' && !(current || period?.from === businessDate)
                    ? 'danger'
                    : 'primary'
                }
                disabled={
                  !online || blocked || (mode !== 'end' && (nights < 1 || check.isFetching))
                }
                loading={save.isPending}
                onClick={() => void submit()}
              >
                {primary}
              </Button>
            </div>
            <span className="text-sm text-text-3">Recorded with your name.</span>
          </div>
        )
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {failure ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-sm text-ro">
            {failure}
          </p>
        ) : null}
        {mode !== 'end' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="From"
              type="date"
              min={businessDate}
              value={from}
              disabled={current}
              onChange={(event) => {
                const next = event.target.value
                setFrom(next)
                if (next && back <= next) setBack(addDays(next, Math.max(1, nights)))
              }}
              className="max-lg:h-11"
            />
            <Field
              label="Back in service"
              type="date"
              data-autofocus
              min={addDays([from, businessDate].sort().at(-1) ?? businessDate, 1)}
              value={back}
              suffix={nights ? nightsWords(nights) : ' '}
              onChange={(event) => setBack(event.target.value)}
              className="max-lg:h-11"
            />
          </div>
        ) : null}
        {mode === 'create' ? (
          <>
            <Pills
              legend="Reason"
              name="ooo-reason"
              options={REASONS}
              value={reason}
              onChange={setReason}
              error={tried ? problems.reason : undefined}
            />
            {reason === 'other' ? (
              <Field
                label="What is it?"
                value={reasonText}
                maxLength={100}
                onChange={(event) => setReasonText(event.target.value)}
                error={tried ? problems.reasonText : undefined}
              />
            ) : null}
            <TextArea
              id="ooo-note"
              label="Note (optional)"
              value={note}
              onChange={setNote}
              maxLength={OOO_NOTE_MAX}
            />
          </>
        ) : null}
        {mode === 'end' && (current || period?.from === businessDate) ? (
          <Segmented
            label="Room is"
            value={comesBack}
            onChange={setComesBack}
            options={[
              { value: 'dirty', label: 'Dirty' },
              { value: 'clean', label: 'Clean' },
            ]}
          />
        ) : null}
        {mode !== 'create' ? (
          <TextArea
            id="ooo-why"
            label="Reason for the change"
            value={why}
            onChange={setWhy}
            maxLength={200}
            error={tried ? problems.why : undefined}
          />
        ) : null}
        {mode !== 'end' && nights > 0 ? (
          <div
            role="status"
            className={cn(
              'rounded-sm px-3 py-2 text-sm',
              result?.problem ? 'bg-ro-bg text-ro' : 'bg-surface-2 text-text-2',
            )}
          >
            {!online ? (
              OOO_NEEDS_LIVE
            ) : check.isPending ? (
              'Checking the room and rooms left…'
            ) : result?.problem ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>{result.problem.message}</span>
                {blocker && props.onMoveStay ? (
                  <Button
                    size="sm"
                    className="max-lg:h-11"
                    onClick={() => props.onMoveStay?.(blocker.stayId)}
                  >
                    Move {blocker.guestName}
                  </Button>
                ) : null}
              </span>
            ) : (
              leftLine
            )}
          </div>
        ) : null}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  )
}

// "Executive King still has 3 rooms left on 25 Nov and 5 on 26 Nov."
export function leftWords(left: readonly { date: string; left: number }[], typeName: string) {
  if (left.length === 0) return ''
  const rooms = (n: number) => (n === 1 ? '1 room' : `${n} rooms`)
  if (left.length <= 3) {
    const parts = left.map((night, i) =>
      i === 0
        ? `${rooms(night.left)} left on ${formatRateDate(night.date, false)}`
        : `${night.left} on ${formatRateDate(night.date, false)}`,
    )
    const words =
      parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
    return `${typeName} still has ${words}.`
  }
  const lowest = left.reduce((low, night) => (night.left < low.left ? night : low))
  return `${typeName} still has at least ${rooms(lowest.left)} left each night (fewest on ${formatRateDate(lowest.date, false)}).`
}
