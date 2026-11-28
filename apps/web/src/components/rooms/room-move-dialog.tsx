// Room move (design #31 DlgRoomMove, DlgRoomMoveM; spec: "Room move dialog"). Rooms free for every
// night: the stay's own type first (ready rooms first when the guest arrives today), then other
// types its plan sells and its party fits, cheapest first. Same type: saved at once with Undo.
// Another type: a modify (brick 6) with the room, quoted before saving; keeping the booked price is
// a discount with reason Upgrade, over the mover's limit it asks for approval. A dialog on desktop,
// a bottom sheet on phones.
import {
  keepPreviousData,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  type ApprovalView,
  dec,
  firstNameOf,
  formatMoney,
  formatRateDate,
  newId,
  nightsBetween,
  ROOM_MOVE_REASON_LABELS,
  ROOM_MOVE_REASONS,
  ROOM_OPTIONS_SHOWN,
  type RoomMoveReason,
  type RoomOption,
  type RoomOptions,
  rangeLabel,
} from '@vento/shared'
import { Accessibility, Check, Link2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApprovalPrompt } from '@/components/approvals/approval-prompt'
import {
  AUDIT_LINE,
  FigureBox,
  Pills,
  TextArea,
  useDialogLeaveGuard,
} from '@/components/reservations/change-parts'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, isConnectionProblem, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'

const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })
const MOVE_NEEDS_LIVE = 'Moving rooms needs a connection.'
const REASONS = ROOM_MOVE_REASONS.map((value) => ({ value, label: ROOM_MOVE_REASON_LABELS[value] }))

type Props = {
  stayId: string
  version: number
  // A room dropped on in the chart: picked when the dialog opens.
  initialRoomId?: string | undefined
  onClose: () => void
  // After a save: the chart and the reservation refresh.
  onDone?: () => void
  timeZone?: string
}

type Choice = { room: RoomOption; typeId: string; typeName: string; difference: string | null }

const signed = (amount: string) =>
  dec(amount).isNegative() ? `−${naira(dec(amount).abs().toString())}` : `+${naira(amount)}`

export function RoomMoveDialog({
  stayId,
  version,
  initialRoomId,
  onClose,
  onDone,
  timeZone = 'Africa/Lagos',
}: Props) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const options = useQuery({
    ...orpc.stays.roomOptions.queryOptions({ input: { stayId, version } }),
    enabled: online,
    retry: false,
    staleTime: 0,
  })
  const data = options.data
  const [picked, setPicked] = useState<string | undefined>(initialRoomId)
  const [showAll, setShowAll] = useState<Set<string>>(new Set())
  const [rate, setRate] = useState<'charge' | 'keep'>('charge')
  const [reason, setReason] = useState<RoomMoveReason>()
  const [reasonText, setReasonText] = useState('')
  const [note, setNote] = useState('')
  const [failure, setFailure] = useState<string>()
  const [retrying, setRetrying] = useState(false)
  const [prompt, setPrompt] = useState(false)
  const [waiting, setWaiting] = useState<ApprovalView | null>(null)
  const key = useRef(newId())

  const all = useMemo(() => {
    if (!data) return [] as Choice[]
    return [
      ...data.sameType.map((room) => ({
        room,
        typeId: data.stay.roomTypeId,
        typeName: data.stay.roomTypeName,
        difference: null,
      })),
      ...data.otherTypes.flatMap((type) =>
        type.rooms.map((room) => ({
          room,
          typeId: type.roomTypeId,
          typeName: type.name,
          difference: type.difference,
        })),
      ),
    ]
  }, [data])
  const choice = all.find((option) => option.room.id === picked)
  const otherType = Boolean(choice && data && choice.typeId !== data.stay.roomTypeId)
  const upgrade = Boolean(otherType && choice?.difference && dec(choice.difference).greaterThan(0))
  const keep = upgrade && rate === 'keep'
  useEffect(() => {
    if (keep && !reason) setReason('upgrade')
  }, [keep, reason])

  // Another type: brick 6's quote with the room, as Save would send it.
  const fields =
    data && choice && otherType
      ? {
          reservationId: data.stay.reservationId,
          stayId: data.stay.id,
          version: data.stay.version,
          arrival: data.stay.arrival,
          departure: data.stay.departure,
          roomTypeId: choice.typeId,
          adults: data.stay.adults,
          children: data.stay.children,
          roomId: choice.room.id,
          ...(keep ? { keepBookedPrice: note.trim() ? { note: note.trim() } : {} } : {}),
        }
      : undefined
  const quote = useQuery({
    ...orpc.reservations.quoteChange.queryOptions({ input: fields ?? skipToken }),
    enabled: Boolean(fields) && online,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
  })
  const q = fields && !quote.isError ? quote.data : undefined
  const overLimit = Boolean(keep && q?.discount && !q.discount.within)

  const save = useMutation({
    mutationFn: async (approvalId?: string) => {
      if (!data || !choice) throw new Error('Pick a room')
      if (!otherType) {
        return api.stays.assignRoom({
          idempotencyKey: key.current,
          stayId: data.stay.id,
          version: data.stay.version,
          roomId: choice.room.id,
          ...(reason ? { reason } : {}),
          ...(reason === 'other' && reasonText.trim() ? { reasonText: reasonText.trim() } : {}),
          source: 'dialog',
        })
      }
      if (!fields || !q) throw new Error('The price is still loading')
      return api.reservations.modify({
        idempotencyKey: key.current,
        ...fields,
        changeHash: q.changeHash,
        source: 'tape_chart',
        ...(approvalId ? { approvalId } : {}),
      })
    },
  })
  const remove = useMutation({
    mutationFn: () =>
      api.stays.assignRoom({
        idempotencyKey: key.current,
        stayId: data?.stay.id ?? stayId,
        version: data?.stay.version ?? version,
        roomId: null,
        source: 'dialog',
      }),
  })

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.reservations.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.approvals.key() }),
    ])

  const cancelRequest = useMutation(orpc.approvals.cancel.mutationOptions())
  const withdraw = () => {
    if (waiting?.status === 'pending') cancelRequest.mutate({ id: waiting.id, reason: 'discarded' })
  }
  const leaveBar = useDialogLeaveGuard(
    withdraw,
    waiting?.status === 'pending'
      ? `Your request to ${firstNameOf(waiting.approver?.name ?? 'the manager')} is cancelled.`
      : undefined,
  )

  const guest = data?.stay.guestName ?? ''
  const submit = async (approvalId?: string, approverName?: string) => {
    if (!choice || !data || save.isPending || !online) return
    if (reason === 'other' && !reasonText.trim()) {
      setFailure('Say why, in a few words.')
      return
    }
    // In house (brick 8): a move always says why.
    if (data.inHouse && !reason) {
      setFailure('Pick why the guest is moving.')
      return
    }
    if (overLimit && !approvalId) {
      setPrompt(true)
      return
    }
    setFailure(undefined)
    try {
      await save.mutateAsync(approvalId)
      setRetrying(false)
      key.current = newId()
      await refresh()
      onDone?.()
      onClose()
      const approver = approverName ?? (approvalId ? waiting?.approver?.name : undefined)
      toast.success(
        approvalId
          ? `${guest} moved to ${choice.room.number} · upgrade approved${approver ? ` by ${approver}` : ''}`
          : stay?.room
            ? `${guest} moved to ${choice.room.number}`
            : `${guest} assigned to ${choice.room.number}`,
      )
    } catch (error) {
      if (isConnectionProblem(error as { status?: number })) {
        // Sent just before the connection dropped: asked again with the same key when it's back.
        setRetrying(true)
        return
      }
      setRetrying(false)
      key.current = newId()
      setFailure(problemMessage(error))
      const code = errorCode(error)
      if (code === 'ROOM_TAKEN' || code === 'RESERVATION_CHANGED' || code === 'ROOM_OUT_OF_ORDER') {
        void refresh()
        void options.refetch()
      }
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the connection returns.
  useEffect(() => {
    if (online && retrying) void submit(waiting?.status === 'approved' ? waiting.id : undefined)
  }, [online])

  // A request sent to an inbox: its answer is read every 3 seconds, then the move goes ahead.
  const watched = useQuery({
    ...orpc.approvals.get.queryOptions({ input: { id: waiting?.id ?? '' } }),
    enabled: Boolean(waiting && waiting.status === 'pending') && online,
    refetchInterval: 3000,
    retry: false,
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the answer arrives.
  useEffect(() => {
    const view = watched.data
    if (!view || !waiting || view.id !== waiting.id || view.status === waiting.status) return
    setWaiting(view)
    if (view.status === 'approved') void submit(view.id, view.approver?.name)
  }, [watched.data])

  const stay = data?.stay
  const nights = stay ? nightsBetween(data?.inHouse ? data.from : stay.arrival, stay.departure) : 0
  const title = stay ? (stay.room ? `Room move · ${guest}` : `Assign room · ${guest}`) : 'Room move'
  // In house: "503 Executive King · in house since 23 Nov · 2 nights left (25–27 Nov)".
  const subtitle = stay
    ? data?.inHouse
      ? `${stay.room ? `${stay.room.number} ` : ''}${stay.roomTypeName} · in house since ${formatRateDate(stay.arrival, false)} · ${nights === 1 ? '1 night' : `${nights} nights`} left (${rangeLabel(data.from, stay.departure)})`
      : `${stay.room ? `${stay.room.number} ` : ''}${stay.roomTypeName} · ${rangeLabel(stay.arrival, stay.departure, true)} · ${nights === 1 ? '1 night' : `${nights} nights`}`
    : undefined
  const primary = choice
    ? overLimit
      ? `Ask for approval · ${q?.discount?.percent ?? ''}%`
      : stay?.room
        ? `Move to ${choice.room.number}`
        : `Assign ${choice.room.number}`
    : stay?.room
      ? 'Move'
      : 'Assign'
  const close = () => {
    withdraw()
    onClose()
  }

  return (
    <>
      <Dialog
        open={!prompt}
        onClose={close}
        title={title}
        description={subtitle}
        className="max-w-[640px]"
        footer={
          leaveBar ?? (
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
                {!online ? (
                  <span className="mr-auto text-sm text-text-3" role="status">
                    {MOVE_NEEDS_LIVE}
                  </span>
                ) : null}
                {stay?.room && !data?.blocked && !data?.inHouse ? (
                  <Button
                    variant="ghost"
                    className="mr-auto text-ro"
                    disabled={!online || remove.isPending}
                    onClick={async () => {
                      try {
                        await remove.mutateAsync()
                        await refresh()
                        onDone?.()
                        onClose()
                        toast.success(`Room removed from ${guest}`)
                      } catch (error) {
                        setFailure(problemMessage(error))
                      }
                    }}
                  >
                    Remove room
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={close}>
                  Cancel <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">esc</kbd>
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    !online ||
                    !choice ||
                    Boolean(data?.blocked) ||
                    (otherType && (!q || quote.isFetching)) ||
                    waiting?.status === 'pending'
                  }
                  loading={save.isPending}
                  onClick={() => void submit()}
                >
                  {primary} <kbd className="ml-1 text-xs opacity-80 max-lg:hidden">↵</kbd>
                </Button>
              </div>
              <span className="text-sm text-text-3">{AUDIT_LINE}</span>
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
          {retrying ? (
            <p role="status" className="rounded-sm bg-bl-bg px-3 py-2 text-sm text-bl">
              Checking whether {guest} was moved…
            </p>
          ) : null}
          {failure ? (
            <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-sm text-ro">
              {failure}
            </p>
          ) : null}
          {!online && !data ? (
            <p className="text-text-2">{MOVE_NEEDS_LIVE}</p>
          ) : options.isPending ? (
            <div
              className="flex flex-col gap-2"
              role="status"
              aria-busy="true"
              aria-label="Loading rooms"
            >
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" />
              ))}
            </div>
          ) : options.isError ? (
            <p role="alert" className="text-ro">
              {problemMessage(options.error)}
            </p>
          ) : data?.blocked ? (
            <p className="rounded-sm bg-am-bg px-3 py-2 text-am">{data.blocked}</p>
          ) : data ? (
            <RoomLists
              data={data}
              picked={picked}
              onPick={(id) => {
                setPicked(id)
                setFailure(undefined)
                setRate('charge')
              }}
              showAll={showAll}
              onShowAll={(id) => setShowAll(new Set([...showAll, id]))}
            />
          ) : null}
          {data && choice && otherType ? (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-2/60 p-3">
              {upgrade ? (
                <Segmented
                  label="Rate"
                  value={rate}
                  onChange={setRate}
                  options={[
                    {
                      value: 'charge',
                      label: `Charge ${choice.typeName} rate · ${signed(choice.difference ?? '0')} a night`,
                    },
                    { value: 'keep', label: `Keep ${naira(data.stay.soldPerNight)} a night` },
                  ]}
                />
              ) : null}
              {quote.isError ? (
                <p role="alert" className="text-sm text-ro">
                  {problemMessage(quote.error)}
                </p>
              ) : q ? (
                <FigureBox
                  rows={[
                    {
                      label: `Stay total incl. taxes (${q.nights.length === 1 ? '1 night' : `${q.nights.length} nights`})`,
                      value: `${naira(q.before.total)} → ${naira(q.totals.total)}`,
                    },
                    {
                      label: q.difference.sign >= 0 ? 'Added to stay' : 'Taken off the stay',
                      value: `${q.difference.sign < 0 ? '−' : '+'}${naira(q.difference.amount)}`,
                      strong: true,
                    },
                  ]}
                >
                  {q.latePenalty ? (
                    <p className="text-sm text-am">
                      Free cancellation has ended, so a late-change penalty of{' '}
                      {naira(q.latePenalty.amount)} applies.
                    </p>
                  ) : null}
                </FigureBox>
              ) : (
                <div
                  className="h-16 animate-pulse rounded-md bg-surface"
                  role="status"
                  aria-label="Pricing the move"
                />
              )}
              {keep && q?.discount ? (
                <p className={cn('text-sm', overLimit ? 'text-am' : 'text-text-2')}>
                  Keeping the {data.stay.roomTypeName} price is a {q.discount.percent}% discount on{' '}
                  {choice.typeName}
                  {overLimit
                    ? `, over your ${q.discount.limit ?? '0'}% limit. A manager with a higher limit can approve it.`
                    : ', within your limit.'}
                </p>
              ) : null}
            </div>
          ) : null}
          {data && choice ? (
            <>
              <Pills
                legend={keep || data.inHouse ? 'Reason (required)' : 'Reason (optional)'}
                name="move-reason"
                options={keep ? REASONS.filter((r) => r.value === 'upgrade') : REASONS}
                value={reason}
                onChange={setReason}
              />
              {reason === 'other' || keep ? (
                <TextArea
                  id="move-reason-text"
                  label={keep ? 'Why (optional)' : 'Say why'}
                  value={keep ? note : reasonText}
                  onChange={keep ? setNote : setReasonText}
                  maxLength={200}
                />
              ) : null}
            </>
          ) : null}
          {waiting?.status === 'pending' ? (
            <p role="status" className="rounded-sm bg-bl-bg px-3 py-2 text-sm text-bl">
              Asked {waiting.approver?.name ?? 'a manager'}. The move saves when they approve.
            </p>
          ) : null}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Dialog>
      {prompt && fields && q ? (
        <ApprovalPrompt
          action={{ kind: 'modify_discount', change: { ...fields, idempotencyKey: key.current } }}
          timeZone={timeZone}
          approveLabel="Approve upgrade and move"
          onApproved={(approval) => {
            setPrompt(false)
            setWaiting(approval)
            void submit(approval.id, approval.approver?.name)
          }}
          onSent={(approval) => {
            setPrompt(false)
            setWaiting(approval)
          }}
          onClose={() => setPrompt(false)}
        />
      ) : null}
    </>
  )
}

function RoomLists({
  data,
  picked,
  onPick,
  showAll,
  onShowAll,
}: {
  data: RoomOptions
  picked: string | undefined
  onPick: (id: string) => void
  showAll: ReadonlySet<string>
  onShowAll: (typeId: string) => void
}) {
  const same = data.sameType
  const others = data.otherTypes
  const freeOthers = others.reduce((sum, type) => sum + type.rooms.length, 0)
  const groups = [
    {
      id: data.stay.roomTypeId,
      heading: data.arrivesToday
        ? 'Ready rooms first'
        : `${data.stay.roomTypeName} · free every night`,
      rooms: same,
      typeName: data.stay.roomTypeName,
      difference: null as string | null,
    },
    ...others.map((type) => ({
      id: type.roomTypeId,
      heading: `${type.name} · ${dec(type.difference).greaterThan(0) ? 'upgrade' : dec(type.difference).isZero() ? 'same price' : 'lower price'}`,
      rooms: type.rooms,
      typeName: type.name,
      difference: type.difference,
    })),
  ]
  return (
    <div className="flex flex-col gap-4">
      {same.length === 0 ? (
        <p className="rounded-sm bg-am-bg px-3 py-2 text-sm text-am">
          No {data.stay.roomTypeName} room is free for all of{' '}
          {rangeLabel(data.stay.arrival, data.stay.departure)}.
          {freeOthers
            ? ` ${freeOthers} ${freeOthers === 1 ? 'room of another type is' : 'rooms of other types are'} free as an upgrade.`
            : ''}
        </p>
      ) : null}
      {groups.map((group) =>
        group.rooms.length === 0 ? null : (
          <fieldset key={group.id} className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-text-2">{group.heading}</legend>
            {(showAll.has(group.id) ? group.rooms : group.rooms.slice(0, ROOM_OPTIONS_SHOWN)).map(
              (room) => (
                <RoomChoice
                  key={room.id}
                  room={room}
                  typeName={group.typeName}
                  difference={group.difference}
                  inclusive={data.stay.pricesIncludeTaxes}
                  showStatus={data.arrivesToday}
                  checked={picked === room.id}
                  onPick={() => onPick(room.id)}
                />
              ),
            )}
            {!showAll.has(group.id) && group.rooms.length > ROOM_OPTIONS_SHOWN ? (
              <Button
                variant="ghost"
                className="self-start max-lg:h-11"
                onClick={() => onShowAll(group.id)}
              >
                Show all {group.rooms.length}
              </Button>
            ) : null}
          </fieldset>
        ),
      )}
    </div>
  )
}

const STATUS_TONE = {
  inspected: 'bg-em-bg text-em',
  clean: 'bg-em-bg text-em',
  dirty: 'bg-am-bg text-am',
} as const
const STATUS_WORD = { inspected: 'Inspected', clean: 'Clean', dirty: 'Dirty' } as const

function RoomChoice({
  room,
  typeName,
  difference,
  inclusive,
  showStatus,
  checked,
  onPick,
}: {
  room: RoomOption
  typeName: string
  difference: string | null
  // The plan's basis: the difference is all-in on an inclusive plan (decision 0032).
  inclusive: boolean
  showStatus: boolean
  checked: boolean
  onPick: () => void
}) {
  const features = [
    ...room.features,
    ...(room.connectsTo.length ? [`Connects to ${room.connectsTo.join(', ')}`] : []),
  ]
  return (
    <label
      className={cn(
        'relative flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
        checked ? 'border-brand bg-pri-soft' : 'border-border bg-surface hover:bg-surface-2',
      )}
    >
      <input
        type="radio"
        name="room-choice"
        className="absolute inset-0 cursor-pointer opacity-0"
        checked={checked}
        onChange={onPick}
      />
      <span
        aria-hidden="true"
        className={cn(
          'grid size-4 flex-none place-items-center rounded-full border',
          checked ? 'border-brand bg-brand' : 'border-border-strong bg-surface',
        )}
      >
        {checked ? <span className="size-1.5 rounded-full bg-white" /> : null}
      </span>
      <span className="num w-12 flex-none font-semibold">{room.number}</span>
      <span className="flex min-w-0 grow flex-col">
        <span className="truncate" title={[typeName, ...features].join(' · ')}>
          {typeName}
          {features.length ? <span className="text-text-2"> · {features.join(' · ')}</span> : null}
        </span>
      </span>
      {room.accessible ? (
        <Accessibility className="size-4 flex-none text-text-3" aria-label="Accessible" />
      ) : null}
      {room.connectsTo.length ? (
        <Link2 className="size-4 flex-none text-text-3 max-sm:hidden" aria-hidden="true" />
      ) : null}
      {showStatus ? (
        <span
          className={cn(
            'inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            STATUS_TONE[room.status],
          )}
        >
          {room.status === 'inspected' ? <Check className="size-3" aria-hidden="true" /> : null}
          {STATUS_WORD[room.status]}
        </span>
      ) : null}
      <span className="num flex-none text-right text-sm whitespace-nowrap text-text-2">
        {difference === null || dec(difference).isZero()
          ? 'same rate'
          : `${signed(difference)} a night ${inclusive ? 'incl.' : 'excl.'} taxes`}
      </span>
    </label>
  )
}
