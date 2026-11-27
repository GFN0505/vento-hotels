// Modify reservation (design #31 DlgModify, DlgModifyM): Arrive, Leave, Room type and Guests, with
// the server's figures on each edit (reservations.quoteChange): new nights at today's rate, the
// stay total before → after, rooms free on the new nights, the deposit and the deadline. Change rate
// sets or removes the discount. Over the saver's limit, Save asks for approval; after the deadline a
// lower total shows its penalty first, waivable. Save sends the hash it showed and the stay version.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ApprovalView,
  addDays,
  type ChangeDiscount,
  type ChangedReservation,
  DISCOUNT_REASON_LABELS,
  DISCOUNT_REASONS,
  type DiscountReason,
  dec,
  firstNameOf,
  newId,
  type ReservationDetail,
  toAmount,
} from '@vento/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApprovalPrompt } from '@/components/approvals/approval-prompt'
import { answerLine } from '@/components/approvals/format'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import {
  availabilityLine,
  deadlineLine,
  depositLine,
  lateChangeLine,
  leaveDelta,
  NEEDS_CONNECTION,
  newNightLine,
  overLimitLine,
  saveState,
} from './change-model'
import { AUDIT_LINE, FigureBox, Pills, useDialogLeaveGuard, WaiveField } from './change-parts'
import { dateLabel, naira } from './format'

type Props = { detail: ReservationDetail; onClose: () => void }

const REASONS = DISCOUNT_REASONS.map((value) => ({ value, label: DISCOUNT_REASON_LABELS[value] }))

// Waits a moment after the last edit before asking for new figures.
function useSettled<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

export function ModifyDialog({ detail, onClose }: Props) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const stay = detail.stays[0]
  const tz = detail.property.timeZone
  const key = useRef(newId())
  const [arrival, setArrival] = useState(stay?.arrival ?? '')
  const [departure, setDeparture] = useState(stay?.departure ?? '')
  const [roomTypeId, setRoomTypeId] = useState(stay?.roomTypeId ?? '')
  const [adults, setAdults] = useState(stay?.adults ?? 1)
  const [children, setChildren] = useState(stay?.children ?? 0)
  const [discount, setDiscount] = useState<ChangeDiscount>({ mode: 'keep' })
  const [rateOpen, setRateOpen] = useState(false)
  const [percent, setPercent] = useState('')
  const [rateReason, setRateReason] = useState<DiscountReason>()
  const [restrictionReason, setRestrictionReason] = useState('')
  const [waive, setWaive] = useState(false)
  const [waiveReason, setWaiveReason] = useState('')
  const [failure, setFailure] = useState<string>()
  const [problem, setProblem] = useState<string>()
  const [prompt, setPrompt] = useState<'discount' | 'waiver' | null>(null)
  const [waiting, setWaiting] = useState<ApprovalView | null>(null)

  const fields = {
    reservationId: detail.id,
    stayId: stay?.id ?? '',
    version: stay?.version ?? 1,
    arrival,
    departure,
    roomTypeId,
    adults,
    children,
    discount,
  }
  // Compared by value: a new object each render must not restart the wait.
  const settledJson = useSettled(JSON.stringify(fields))
  const settled = useMemo(() => JSON.parse(settledJson) as typeof fields, [settledJson])
  const valid =
    settled.departure > settled.arrival && settled.arrival >= detail.property.businessDate
  const quote = useQuery({
    ...orpc.reservations.quoteChange.queryOptions({ input: settled }),
    enabled: online && valid && Boolean(stay),
    placeholderData: keepPreviousData,
    staleTime: 0,
    retry: false,
  })
  const q = quote.isError ? undefined : quote.data
  const canWaive = Boolean(q?.canWaive)
  const state = saveState(q, { waive, canWaive, online })
  const modify = useMutation({
    mutationFn: (extra: { approvalId?: string; waive?: { reason: string; approvalId?: string } }) =>
      api.reservations.modify({
        idempotencyKey: key.current,
        ...fields,
        changeHash: q?.changeHash ?? '',
        ...(restrictionReason.trim() ? { restrictionReason: restrictionReason.trim() } : {}),
        ...(extra.approvalId ? { approvalId: extra.approvalId } : {}),
        ...(extra.waive ? { waive: extra.waive } : {}),
      }),
  })
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

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.reservations.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.approvals.key() }),
    ])

  const done = (result: ChangedReservation) => {
    toast.success(`${result.number} changed`)
    void refresh()
    onClose()
  }
  const failed = (error: unknown) => {
    setFailure(problemMessage(error))
    const code = errorCode(error)
    if (code === 'RESERVATION_CHANGED') void refresh()
    if (code === 'PRICE_CHANGED' || code === 'SOLD_OUT' || code === 'RESERVATION_CHANGED') {
      void quote.refetch()
    }
  }

  const broken = q?.breaks[0]
  const needsRestrictionReason = Boolean(broken && !q?.breakAlreadyAllowed)

  const save = async (extra: Parameters<typeof modify.mutateAsync>[0] = {}) => {
    try {
      done(await modify.mutateAsync(extra))
    } catch (error) {
      failed(error)
    }
  }

  const submit = () => {
    if (state.disabled || modify.isPending || !q) return
    setFailure(undefined)
    if (needsRestrictionReason && restrictionReason.trim().length < 3) {
      setProblem('Give a reason for booking through the min stay.')
      return
    }
    if (waive && q.latePenalty && !waiveReason.trim()) {
      setProblem("Say why you're waiving the penalty.")
      return
    }
    setProblem(undefined)
    if (state.action === 'ask_discount') return setPrompt('discount')
    if (state.action === 'ask_waiver') return setPrompt('waiver')
    void save(waive && q.latePenalty ? { waive: { reason: waiveReason.trim() } } : {})
  }

  // A request sent to an inbox: its answer is read every 3 seconds, then Save goes ahead with it.
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
    if (view.status === 'approved') void save({ approvalId: view.id })
  }, [watched.data])

  const setRate = (value: string, reason: DiscountReason | undefined) => {
    setPercent(value)
    setRateReason(reason)
    if (/^\d{1,2}(\.\d{1,2})?$/.test(value) && reason) {
      setDiscount({ mode: 'set', discount: { kind: 'percent', value, reason } })
    }
  }

  const types = q?.roomTypes ?? []
  const typeOf = types.find((t) => t.id === roomTypeId)
  const fresh = q?.nights.filter((n) => !n.kept) ?? []
  const freshTaxes = toAmount(fresh.reduce((sum, n) => sum.plus(n.gross).minus(n.net), dec('0')))
  const available = q ? availabilityLine(q) : null
  const subtitle = stay
    ? `${detail.guest.firstName} ${detail.guest.lastName} · ${stay.roomTypeName} · ${stay.terms.planName}`
    : ''

  return (
    <>
      <Dialog
        open={prompt === null}
        onClose={() => {
          withdraw()
          onClose()
        }}
        title={`Modify reservation · ${detail.number}`}
        description={subtitle}
        className="max-w-[600px]"
        footer={
          leaveBar ?? (
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
                {state.hint ? (
                  <span className="mr-auto text-sm text-text-3" role="status">
                    {state.hint}
                  </span>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={() => {
                    withdraw()
                    onClose()
                  }}
                >
                  Cancel <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">esc</kbd>
                </Button>
                <Button
                  variant="primary"
                  disabled={state.disabled || quote.isFetching || waiting?.status === 'pending'}
                  loading={modify.isPending}
                  onClick={submit}
                >
                  {state.label} <kbd className="ml-1 text-xs opacity-80 max-lg:hidden">↵</kbd>
                </Button>
              </div>
              <span className="text-sm text-text-3">{AUDIT_LINE}</span>
            </div>
          )
        }
      >
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Arrive"
              type="date"
              min={detail.property.businessDate}
              value={arrival}
              onChange={(event) => {
                const next = event.target.value
                const length = stay ? nightsOf(stay.arrival, stay.departure) : 1
                setArrival(next)
                if (next && departure <= next) setDeparture(addDays(next, length))
              }}
              className="max-lg:h-11"
            />
            <Field
              label="Leave"
              type="date"
              data-autofocus
              min={arrival ? addDays(arrival, 1) : undefined}
              value={departure}
              // Always a suffix, so the field isn't rebuilt (and doesn't lose focus) when it shows.
              suffix={leaveDelta(q) || '\u00a0'}
              onChange={(event) => setDeparture(event.target.value)}
              className="max-lg:h-11"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-text-2">Room type</span>
              <select
                value={roomTypeId}
                onChange={(event) => setRoomTypeId(event.target.value)}
                className="h-11 w-full rounded-sm border border-input bg-surface px-2.5 text-[16px] focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:h-9 lg:text-base"
              >
                {(types.length
                  ? types
                  : stay
                    ? [{ id: stay.roomTypeId, name: stay.roomTypeName }]
                    : []
                ).map((type) => {
                  const t = types.find((x) => x.id === type.id)
                  const note = t?.soldOutOn
                    ? ` · Sold out ${dateLabel(t.soldOutOn, false)}`
                    : t && !t.fits
                      ? ` · Sleeps ${t.maxAdults} ${t.maxAdults === 1 ? 'adult' : 'adults'}`
                      : ''
                  return (
                    <option
                      key={type.id}
                      value={type.id}
                      disabled={type.id !== roomTypeId && Boolean(t?.soldOutOn || (t && !t.fits))}
                    >
                      {type.name}
                      {note}
                    </option>
                  )
                })}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Counter
                label="Adults"
                value={adults}
                min={1}
                max={typeOf?.maxAdults ?? 6}
                onChange={setAdults}
              />
              <Counter
                label="Children"
                value={children}
                min={0}
                max={typeOf?.maxChildren ?? 4}
                onChange={setChildren}
              />
            </div>
          </div>

          {quote.isError ? (
            <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
              {problemMessage(quote.error)}
            </p>
          ) : null}
          {!online ? (
            <p role="status" className="rounded-sm bg-am-bg px-3 py-2 text-am">
              {NEEDS_CONNECTION}
            </p>
          ) : null}

          {q ? (
            <FigureBox
              rows={[
                ...fresh.slice(0, 3).map((night) => ({
                  label: newNightLine(night.date, q.planName),
                  value: naira(night.soldPrice),
                })),
                ...(fresh.length > 3
                  ? [{ label: `and ${fresh.length - 3} more new nights`, value: '' }]
                  : []),
                ...(fresh.length
                  ? [
                      {
                        label: 'Service charge, VAT, consumption tax',
                        value: naira(freshTaxes),
                      },
                    ]
                  : []),
                {
                  label: 'Stay total',
                  value: `${naira(q.before.total)} → ${naira(q.totals.total)}`,
                  strong: true,
                },
              ]}
            >
              {q.fx ? <p className="text-right text-sm text-text-3">≈ {q.fx.text}</p> : null}
            </FigureBox>
          ) : (
            <span aria-hidden="true" className="h-24 animate-pulse rounded-sm bg-surface-2" />
          )}

          {available ? (
            <p className={cn('text-sm', available.tone === 'emerald' ? 'text-em' : 'text-ro')}>
              {available.text}
            </p>
          ) : null}

          {q && overLimitLine(q) ? (
            <div className="flex flex-col gap-2 rounded-sm bg-am-bg px-3 py-2 text-am">
              <p className="text-sm">{overLimitLine(q)}</p>
              {discount.mode === 'keep' ? (
                <label
                  htmlFor="new-nights-plain"
                  className="inline-flex min-h-11 items-center gap-2.5 text-sm text-text lg:min-h-0"
                >
                  <Checkbox
                    id="new-nights-plain"
                    checked={false}
                    onChange={() => setDiscount({ mode: 'kept_only' })}
                  />
                  Price new nights without the discount
                </label>
              ) : null}
            </div>
          ) : null}
          {discount.mode === 'kept_only' ? (
            <label
              htmlFor="new-nights-plain-on"
              className="inline-flex min-h-11 items-center gap-2.5 text-sm lg:min-h-0"
            >
              <Checkbox
                id="new-nights-plain-on"
                checked
                onChange={() => setDiscount({ mode: 'keep' })}
              />
              Price new nights without the discount
            </label>
          ) : null}

          {needsRestrictionReason && broken ? (
            <Field
              label={`Reason for booking through ${broken.kind === 'min_stay' ? 'the min stay' : broken.kind === 'closed' ? 'the closure' : 'the closed-to-arrival day'}`}
              hint={broken.message}
              value={restrictionReason}
              maxLength={300}
              onChange={(event) => setRestrictionReason(event.target.value)}
              className="max-lg:h-11"
            />
          ) : null}

          {q && lateChangeLine(q, tz) ? (
            <div className="flex flex-col gap-2 rounded-sm border border-am-dot/40 bg-am-bg p-3">
              <p className="text-sm text-am">{lateChangeLine(q, tz)}</p>
              <WaiveField
                checked={waive}
                onChecked={setWaive}
                reason={waiveReason}
                onReason={setWaiveReason}
                note={canWaive ? null : 'Waiving needs a manager.'}
              />
            </div>
          ) : null}

          {rateOpen ? (
            <section
              aria-label="Change rate"
              className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-3"
            >
              <h3 className="font-semibold">Change rate</h3>
              <Field
                label="Discount on every night"
                inputMode="decimal"
                suffix="%"
                value={percent}
                onChange={(event) => setRate(event.target.value, rateReason)}
                className="max-lg:h-11"
              />
              <Pills
                legend="Reason"
                name="change-rate-reason"
                options={REASONS}
                value={rateReason}
                onChange={(value) => setRate(percent, value)}
              />
              <div className="flex flex-wrap gap-2">
                {q?.existingDiscount ? (
                  <Button
                    variant="ghost"
                    className="max-lg:h-11"
                    onClick={() => {
                      setDiscount({ mode: 'remove' })
                      setPercent('')
                      setRateReason(undefined)
                    }}
                  >
                    Remove discount
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="max-lg:h-11"
                  onClick={() => {
                    setDiscount({ mode: 'keep' })
                    setRateOpen(false)
                  }}
                >
                  Keep the booked rate
                </Button>
              </div>
            </section>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center self-start text-sm font-medium text-pri-ink hover:underline lg:min-h-0"
              onClick={() => setRateOpen(true)}
            >
              Change rate
            </button>
          )}

          {q ? (
            <p className="num text-sm text-text-3">
              {[depositLine(q, tz), deadlineLine(q, tz)].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          {waiting ? (
            <p role="status" className="num rounded-sm bg-surface-2 px-3 py-2 text-sm text-text-2">
              {answerLine(waiting, tz)}
            </p>
          ) : null}
          {problem ? (
            <p role="alert" className="text-sm text-ro">
              {problem}
            </p>
          ) : null}
          {failure ? (
            <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
              {failure}
            </p>
          ) : null}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Dialog>
      {prompt === 'discount' && q ? (
        <ApprovalPrompt
          action={{ kind: 'modify_discount', change: { ...fields, idempotencyKey: key.current } }}
          timeZone={tz}
          approveLabel={`Approve ${q.discount?.percent ?? ''}% and save`}
          onApproved={(approval) => {
            setPrompt(null)
            void save({ approvalId: approval.id })
          }}
          onSent={(approval) => {
            setPrompt(null)
            setWaiting(approval)
          }}
          onClose={() => setPrompt(null)}
        />
      ) : null}
      {prompt === 'waiver' && q?.latePenalty ? (
        <ApprovalPrompt
          action={{
            kind: 'penalty_waiver',
            waiver: {
              target: 'modify',
              change: { ...fields, idempotencyKey: key.current },
              reason: waiveReason.trim(),
            },
          }}
          timeZone={tz}
          approveLabel="Approve waiver and save"
          inboxLabel={(name) => `Save now and send the waiver to ${name}'s inbox`}
          beforeSend={async () => {
            const result = await modify.mutateAsync({})
            const penaltyId = result.penalties[0]?.id
            if (!penaltyId) throw new Error('There is no penalty to waive.')
            return {
              kind: 'penalty_waiver',
              waiver: { target: 'penalty', penaltyId, reason: waiveReason.trim() },
            }
          }}
          onApproved={(approval) => {
            setPrompt(null)
            void save({ waive: { reason: waiveReason.trim(), approvalId: approval.id } })
          }}
          onSent={(approval) => {
            toast.success(
              `${detail.number} changed · waiver sent to ${firstNameOf(approval.approver?.name ?? 'the manager')}`,
            )
            void refresh()
            onClose()
          }}
          onClose={() => setPrompt(null)}
        />
      ) : null}
    </>
  )
}

const nightsOf = (arrival: string, departure: string) =>
  Math.max(
    1,
    Math.round(
      (Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`)) / 86_400_000,
    ),
  )

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-text-2">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full rounded-sm border border-input bg-surface px-2.5 text-[16px] focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:h-9 lg:text-base"
      >
        {Array.from({ length: Math.max(max, value) - min + 1 }, (_, i) => min + i).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  )
}
