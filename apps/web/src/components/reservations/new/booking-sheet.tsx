// New reservation (design #4 NewReservation; spec: "User flow"): four steps, Dates & guests · Room &
// rate · Guest · Review & book, with the summary beside them. Enter moves through every step, ⌘↵
// books, ⌘← goes back. The draft lives in memory (booking-draft.ts); availability is checked live
// and again, under lock, at Book. Offline, Book is disabled: nothing is queued.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type ApprovalView, addDays, firstNameOf, type Property } from '@vento/shared'
import { Check } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApprovalPrompt } from '@/components/approvals/approval-prompt'
import { answerLine, NEEDS_CONNECTION, whatOf } from '@/components/approvals/format'
import { useLeaveGuard, useProperty } from '@/components/shell/property-context'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, isConnectionProblem, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { naira, stayRange } from '../format'
import { NEEDS_LIVE } from '../queries'
import {
  clearDraft,
  type Draft,
  getDraft,
  newDraft,
  rememberSource,
  startDraft,
  updateDraft,
  useDraft,
} from './booking-draft'
import {
  approvalDraftOf,
  approvalStale,
  approvalState,
  chosenPlan,
  createInput,
  datesProblems,
  discountInput,
  discountProblems,
  draftFromRequest,
  guestProblems,
  STEPS,
  stepFor,
} from './booking-model'
import { createRequestKeeper } from './request-keeper'
import { StepDates } from './step-dates'
import { StepGuest } from './step-guest'
import { StepReview } from './step-review'
import { StepRoomRate } from './step-room-rate'
import { SummaryAside } from './summary-aside'

const clock = (at: number) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at)

// Starts a draft for the hotel in view, or keeps the one already open for it.
function useOpenDraft(hotel: Property | undefined, scopeKey: string): Draft | undefined {
  const draft = useDraft()
  useEffect(() => {
    const existing = getDraft()
    if (existing && existing.scopeKey === scopeKey) return
    const day = hotel?.businessDate ?? new Date().toISOString().slice(0, 10)
    startDraft(newDraft(scopeKey, hotel?.id, day, addDays(day, 1)))
  }, [hotel, scopeKey])
  return draft?.scopeKey === scopeKey ? draft : undefined
}

// Codes from Book that mean the approval held can't be used: Review asks again.
const APPROVAL_REFUSALS = new Set([
  'APPROVAL_USED',
  'APPROVAL_EXPIRED',
  'APPROVAL_NOT_MATCHING',
  'APPROVAL_NO_LONGER_VALID',
])

type SheetProps = {
  onClose: () => void
  // "Continue booking" from the bell: the request whose stored booking reopens at Review.
  resume?: string | undefined
}

export function BookingSheet({ onClose, resume }: SheetProps) {
  const { scope, properties } = useProperty()
  const online = useOnline()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const scopeKey = scope?.kind === 'hotel' ? scope.hotel.id : 'all'
  const scopedHotel = scope?.kind === 'hotel' ? scope.hotel : undefined
  const draft = useOpenDraft(scopedHotel, scopeKey)
  useResume(resume, scopeKey)
  const hotels = useMemo(() => properties.filter((p) => p.status !== 'archived'), [properties])
  const hotel = scopedHotel ?? hotels.find((p) => p.id === draft?.hotelId)
  const [refusal, setRefusal] = useState<{ step: Draft['step']; message: string; code?: string }>()
  const [leaving, setLeaving] = useState<() => void>()
  const [retrying, setRetrying] = useState(false)
  // Why Continue can't go on yet, shown when it's pressed.
  const [blocked, setBlocked] = useState<{ step: Draft['step']; message: string }>()
  const inFlight = useRef(createRequestKeeper<ReturnType<typeof createInput>>())

  // Changing the hotel in the top bar asks first, then drops the draft.
  useLeaveGuard(useCallback((proceed: () => void) => setLeaving(() => proceed), []))

  const step = draft?.step ?? 1
  const dates = draft ? datesProblems(draft, hotel?.businessDate, !scopedHotel) : {}
  const datesOk = Object.keys(dates).length === 0
  const propertyId = hotel?.id ?? ''

  const availability = useQuery({
    ...orpc.reservations.availability.queryOptions({
      input: {
        propertyId,
        arrival: draft?.arrival ?? '',
        departure: draft?.departure ?? '',
        adults: draft?.adults ?? 1,
        children: draft?.children ?? 0,
      },
    }),
    enabled: Boolean(draft && hotel && datesOk && step >= 2 && online),
    // Counts are live: every 30 seconds on Room & rate, and when the window regains focus.
    refetchInterval: step === 2 ? 30_000 : false,
    refetchOnWindowFocus: true,
    retry: false,
  })

  const discount = discountInput(draft?.discount)
  const quoteEnabled = Boolean(
    draft?.roomTypeId && draft.ratePlanId && hotel && datesOk && step >= 2,
  )
  const quote = useQuery({
    ...orpc.reservations.quote.queryOptions({
      input: {
        propertyId,
        roomTypeId: draft?.roomTypeId ?? '',
        ratePlanId: draft?.ratePlanId ?? '',
        arrival: draft?.arrival ?? '',
        departure: draft?.departure ?? '',
        adults: draft?.adults ?? 1,
        children: draft?.children ?? 0,
        ...(discount ? { discount } : {}),
        ...(step >= 3 ? { nationality: draft?.guest.nationality } : {}),
        ...(draft?.guest.picked ? { guestId: draft.guest.picked.id } : {}),
      },
    }),
    enabled: quoteEnabled && online,
    placeholderData: (previous) => previous,
    retry: false,
  })

  const create = useMutation(orpc.reservations.create.mutationOptions())
  const cancelRequest = useMutation(orpc.approvals.cancel.mutationOptions())
  const [prompt, setPrompt] = useState(false)
  const approval = draft?.approval
  const approvalNow = approvalState(quote.data, approval)
  const approverFirst = approval ? firstNameOf(approval.approverName) : ''

  // While a request is out, its answer is read every 3 seconds when this tab is visible. A
  // background read: it doesn't keep a shared PC awake.
  const pendingId = approval?.status === 'pending' ? approval.id : undefined
  const watched = useQuery({
    ...orpc.approvals.get.queryOptions({ input: { id: pendingId ?? '' } }),
    enabled: Boolean(pendingId) && online,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  useEffect(() => {
    const view = watched.data
    const held = getDraft()?.approval
    if (!view || !held || held.id !== view.id || view.status === held.status) return
    updateDraft({ approval: approvalDraftOf(view, held.quoteHash) })
    const name = view.approver?.name ?? 'The manager'
    if (view.status === 'approved') toast.success(`${name} approved ${whatOf(view.subject)}`)
    else if (view.status === 'declined') toast.info(`${name} declined ${whatOf(view.subject)}`)
  }, [watched.data])

  // Anything that changes the price cancels a pending request and drops an approval for it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the price settles.
  useEffect(() => {
    if (!quote.data || quote.isFetching) return
    const held = getDraft()?.approval
    if (!approvalStale(held, quote.data.quoteHash) || !held) return
    updateDraft({ approval: undefined })
    if (held.status === 'pending') {
      cancelRequest.mutate({ id: held.id, reason: 'booking_changed' })
      toast.info(`Request to ${firstNameOf(held.approverName)} cancelled`)
    }
  }, [quote.data?.quoteHash, quote.isFetching])

  // Leaving the booking withdraws a request still waiting.
  const withdraw = () => {
    const held = getDraft()?.approval
    if (held?.status === 'pending') cancelRequest.mutate({ id: held.id, reason: 'discarded' })
  }

  const limits = {
    canDiscount: availability.data?.canDiscount ?? false,
    discountLimit: availability.data?.discountLimit ?? '0',
  }
  const discountIssues = discountProblems(draft?.discount, quote.data, limits)
  const guestIssues = draft ? guestProblems(draft.guest) : {}
  const chosen = draft ? chosenPlan(availability.data, draft) : undefined
  const breaks = quote.data?.breaks ?? []
  const needsReason = breaks.length > 0 && (draft?.restrictionReason.trim().length ?? 0) < 3

  const canContinue: Record<Draft['step'], boolean> = {
    1: datesOk,
    2:
      Boolean(chosen) &&
      Object.keys(discountIssues).length === 0 &&
      Boolean(quote.data) &&
      !quote.isFetching,
    3: Object.keys(guestIssues).length === 0,
    4: Boolean(quote.data) && !needsReason && online && !quote.isFetching,
  }
  const canBook = canContinue[4] && (approvalNow === 'none' || approvalNow === 'approved')

  const go = (next: Draft['step']) => {
    setRefusal(undefined)
    setBlocked(undefined)
    updateDraft({ step: next })
  }

  // The first thing missing on a step, in words.
  const missing = (at: Draft['step']): string => {
    if (at === 1) return Object.values(dates)[0] ?? 'Check the dates and guests.'
    if (at === 2) {
      if (!chosen) return 'Pick a room type and plan for the stay.'
      const discountProblem = Object.values(discountIssues)[0]
      if (discountProblem) return discountProblem
      return 'Checking the price. One moment.'
    }
    if (at === 3) return Object.values(guestIssues)[0] ?? 'Check the guest details.'
    if (!online) return NEEDS_LIVE
    if (needsReason) return 'Give a reason for booking through the restriction.'
    return 'Checking the price. One moment.'
  }

  const next = () => {
    if (step === 4 && canContinue[4]) {
      if (approvalNow === 'over_limit' || approvalNow === 'expired') setPrompt(true)
      else if (approvalNow === 'declined') changeDiscount()
      else if (canBook) void book()
      return
    }
    if (canContinue[step]) {
      if (step < 4) go((step + 1) as Draft['step'])
      return
    }
    setBlocked({ step, message: missing(step) })
  }

  // Back to Room & rate with the discount field focused.
  const changeDiscount = () => {
    go(2)
    requestAnimationFrame(() => document.getElementById('discount-percent')?.focus())
  }

  const askedFor = (view: ApprovalView) => {
    const hash = quote.data?.quoteHash
    if (!hash) return
    updateDraft({ approval: approvalDraftOf(view, hash) })
    setPrompt(false)
  }

  const book = async () => {
    // The latest draft: an approval given a moment ago is in the store before React re-renders.
    const current = getDraft()
    if (!current || !quote.data || !hotel) return
    setRefusal(undefined)
    const quoted = quote.data
    const input = inFlight.current.take(() => createInput(current, hotel.id, quoted))
    try {
      const booked = await create.mutateAsync(input)
      inFlight.current.clear()
      setRetrying(false)
      rememberSource(current.source)
      const name = `${current.guest.firstName.trim()} ${current.guest.lastName.trim()}`
      toast.success(`Booked ${booked.number} for ${name}`)
      clearDraft()
      void queryClient.invalidateQueries({ queryKey: orpc.reservations.key() })
      onClose()
      void navigate({
        to: '/reservations/$reservationId',
        params: { reservationId: booked.id },
        search: { hotel: hotel.id },
      })
    } catch (error) {
      if (isConnectionProblem(error as { status?: number })) {
        // Sent just before the connection dropped: retried with the same key when it's back.
        setRetrying(true)
        return
      }
      inFlight.current.clear()
      setRetrying(false)
      const code = errorCode(error)
      const target = stepFor(code)
      setRefusal({ step: target, message: problemMessage(error), ...(code ? { code } : {}) })
      if (code && APPROVAL_REFUSALS.has(code)) updateDraft({ approval: undefined })
      if (code === 'SOLD_OUT') void availability.refetch()
      if (code === 'PRICE_CHANGED') void quote.refetch()
      if (target !== step) updateDraft({ step: target })
    }
  }

  // Back online with a booking that may or may not have gone through: ask again, same key.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the connection returns.
  useEffect(() => {
    if (online && retrying && !create.isPending) void book()
  }, [online])

  // Enter, ⌘↵ and ⌘← work from anywhere in the sheet, the footer's buttons included.
  const keys = useRef<(event: KeyboardEvent) => void>(undefined)
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keys.current?.(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  if (!draft) return null

  keys.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented || prompt) return
    const target = event.target as HTMLElement
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key === 'ArrowLeft' && step > 1) {
      event.preventDefault()
      go((step - 1) as Draft['step'])
      return
    }
    if (!target.closest('dialog')) return
    if (event.key !== 'Enter' || target.tagName === 'TEXTAREA') return
    // A focused button keeps its own Enter, except Book's shortcut (⌘↵) below.
    if (target.tagName === 'BUTTON' && !(mod && step === 4)) return
    if (target.closest('[role="combobox"], [data-no-enter]')) return
    if (mod && step === 4) {
      event.preventDefault()
      next()
      return
    }
    if (step < 4) {
      event.preventDefault()
      next()
    }
  }

  const total = quote.data?.totals.total
  const deposit = quote.data?.deposit?.amount
  const footerNote =
    total && step >= 2
      ? `Total ${naira(total)}${deposit ? ` · deposit ${naira(deposit)}` : ''}`
      : undefined

  const footer = leaving ? (
    <div className="flex w-full flex-wrap items-center gap-2" role="alert">
      <p className="grow font-medium">
        {approval?.status === 'pending'
          ? `Discard this booking? Your request to ${approverFirst} is cancelled.`
          : 'Discard this booking?'}
      </p>
      <Button onClick={() => setLeaving(undefined)} data-autofocus>
        Keep booking
      </Button>
      <Button
        variant="danger"
        onClick={() => {
          const proceed = leaving
          setLeaving(undefined)
          withdraw()
          clearDraft()
          onClose()
          proceed()
        }}
      >
        Discard booking
      </Button>
    </div>
  ) : (
    <div className="flex w-full items-center justify-between gap-2">
      {step > 1 ? (
        <Button
          size="lg"
          onClick={() => go((step - 1) as Draft['step'])}
          aria-keyshortcuts="Meta+ArrowLeft"
        >
          Back
          <kbd className="ml-1 hidden text-xs text-text-3 lg:inline">⌘←</kbd>
        </Button>
      ) : (
        <span />
      )}
      <div className="flex min-w-0 items-center gap-3">
        {footerNote ? (
          <span className="num hidden text-sm text-text-3 md:inline">{footerNote}</span>
        ) : null}
        {step < 4 ? (
          <Button variant="primary" size="lg" onClick={next}>
            {step === 2 ? 'Continue to guest' : step === 3 ? 'Continue to review' : 'Continue'}
            <kbd className="ml-1 hidden text-xs opacity-80 lg:inline">↵</kbd>
          </Button>
        ) : (
          <BookButton
            state={approvalNow}
            percent={quote.data?.discount?.percent}
            total={total}
            online={online}
            busy={create.isPending || retrying}
            loading={create.isPending}
            onPress={next}
          />
        )}
      </div>
    </div>
  )

  return (
    <Sheet
      open
      onClose={onClose}
      size="xl"
      bare
      title="New reservation"
      description={
        <span className="flex flex-wrap gap-x-3 text-sm text-text-3">
          <span className="lg:hidden">
            Step {step} of 4 · {STEPS[step - 1]}
          </span>
          {draft.savedAt ? <span>Draft saved {clock(draft.savedAt)}</span> : null}
          <button
            type="button"
            className="inline-flex min-h-11 items-center font-medium text-pri-ink hover:underline lg:min-h-0"
            onClick={() => {
              withdraw()
              clearDraft()
              onClose()
            }}
          >
            Discard draft
          </button>
        </span>
      }
      footer={footer}
    >
      <div className="grid min-h-full lg:grid-cols-[200px_minmax(0,1fr)_320px]">
        <Stepper draft={draft} current={step} canContinue={canContinue} onGo={go} />
        <div className="flex min-w-0 flex-col gap-4 px-5 py-5 sm:px-6">
          {retrying ? (
            <p role="status" className="rounded-sm bg-bl-bg px-3 py-2 text-sm text-bl">
              Checking whether the booking went through…
            </p>
          ) : null}
          {!online && step === 4 ? (
            <p role="status" className="rounded-sm bg-am-bg px-3 py-2 text-sm text-am">
              {NEEDS_LIVE}
            </p>
          ) : null}
          {blocked && blocked.step === step && !canContinue[step] ? (
            <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-sm text-ro">
              {blocked.message}
            </p>
          ) : null}
          {refusal && refusal.step === step ? (
            <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-sm text-ro">
              {refusal.message}
              {refusal.code === 'IDEMPOTENCY_CONFLICT' ? <ExistingLink /> : null}
            </p>
          ) : null}
          {step === 1 ? (
            <StepDates
              draft={draft}
              hotels={scopedHotel ? undefined : hotels}
              hotel={hotel}
              problems={dates}
            />
          ) : step === 2 ? (
            <StepRoomRate draft={draft} availability={availability} hotelName={hotel?.name ?? ''} />
          ) : step === 3 ? (
            <StepGuest draft={draft} problems={guestIssues} showErrors={blocked?.step === 3} />
          ) : (
            <>
              <ApprovalStatus
                state={approvalNow}
                draft={draft}
                quote={quote.data}
                timeZone={hotel?.timeZone ?? 'Africa/Lagos'}
                online={online}
                onCancel={() => {
                  const held = getDraft()?.approval
                  if (!held) return
                  cancelRequest.mutate(
                    { id: held.id, reason: 'by_requester' },
                    {
                      onSuccess: () => {
                        updateDraft({ approval: undefined })
                        toast.info('Request cancelled')
                      },
                      onError: (error) => toast.error(problemMessage(error)),
                    },
                  )
                }}
                onChangeDiscount={changeDiscount}
                onAskAgain={() => setPrompt(true)}
              />
              <StepReview
                draft={draft}
                quote={quote.data}
                hotel={hotel}
                showErrors={blocked?.step === 4}
              />
            </>
          )}
        </div>
        {step >= 2 ? (
          <SummaryAside
            draft={draft}
            quote={quote}
            hotel={hotel}
            editable={step === 2}
            limits={limits}
            problems={discountIssues}
          />
        ) : (
          <aside className="hidden border-l border-border bg-surface-2 px-5 py-5 lg:block">
            <p className="text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase">
              Summary
            </p>
            <p className="mt-1 text-sm text-text-2">
              {datesOk ? stayRange(draft.arrival, draft.departure) : 'Pick the dates and guests.'}
            </p>
          </aside>
        )}
      </div>
      {prompt && quote.data && hotel ? (
        <ApprovalPrompt
          action={{
            kind: 'stay_discount',
            booking: createInput(draft, hotel.id, quote.data),
            stayIndex: 0,
          }}
          timeZone={hotel.timeZone}
          onClose={() => setPrompt(false)}
          onApproved={(view) => {
            askedFor(view)
            void book()
          }}
          onSent={(view) => {
            askedFor(view)
            toast.success(`Sent to ${view.approver?.name ?? 'the manager'}`)
          }}
        />
      ) : null}
    </Sheet>
  )
}

function ExistingLink() {
  return <span className="ml-1">Open it from the Reservations list.</span>
}

function Stepper({
  draft,
  current,
  canContinue,
  onGo,
}: {
  draft: Draft
  current: Draft['step']
  canContinue: Record<Draft['step'], boolean>
  onGo: (step: Draft['step']) => void
}) {
  const reachable = (step: Draft['step']) =>
    step <= current || ([1, 2, 3] as const).filter((s) => s < step).every((s) => canContinue[s])
  return (
    <nav aria-label="Steps" className="hidden border-r border-border px-2.5 py-4 lg:block">
      <ol className="flex flex-col gap-1">
        {STEPS.map((label, index) => {
          const step = (index + 1) as Draft['step']
          const done = step < current
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable(step)}
                aria-current={step === current ? 'step' : undefined}
                onClick={() => onGo(step)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left text-text-2 disabled:cursor-default',
                  step === current && 'bg-pri-soft font-medium text-pri-ink',
                )}
              >
                <span
                  className={cn(
                    'grid size-5 flex-none place-items-center rounded-full border border-border-strong text-xs',
                    done && 'border-pri bg-pri text-white',
                    step === current && 'border-pri text-pri-ink',
                  )}
                >
                  {done ? <Check className="size-3" aria-hidden="true" /> : step}
                </span>
                <span className="flex min-w-0 flex-col leading-5">
                  <span>{label}</span>
                  {step === 1 && done ? (
                    <span className="num text-xs text-text-3">
                      {stayRange(draft.arrival, draft.departure).replace(/ \d{4}$/, '')} ·{' '}
                      {draft.adults === 1 ? '1 adult' : `${draft.adults} adults`}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// "Continue booking": loads the request's stored booking and opens it at Review, for the hotel in
// view (the bell's link selects the request's hotel first).
function useResume(id: string | undefined, scopeKey: string) {
  const request = useQuery({
    ...orpc.approvals.get.queryOptions({ input: { id: id ?? '' } }),
    enabled: Boolean(id),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const told = useRef(false)
  useEffect(() => {
    if (!request.data) return
    const restored = draftFromRequest(request.data, scopeKey)
    if (!restored) {
      if (!told.current) toast.info('This booking can’t be continued any more. Start it again.')
      told.current = true
      return
    }
    const open = getDraft()
    if (open?.key === restored.key && open.scopeKey === scopeKey) return
    startDraft(restored)
  }, [request.data, scopeKey])
}

function BookButton({
  state,
  percent,
  total,
  online,
  busy,
  loading,
  onPress,
}: {
  state: ReturnType<typeof approvalState>
  percent: string | undefined
  total: string | undefined
  online: boolean
  busy: boolean
  loading: boolean
  onPress: () => void
}) {
  if (state === 'over_limit' || state === 'expired') {
    return (
      <Button
        variant="primary"
        size="lg"
        disabled={!online}
        title={online ? undefined : NEEDS_CONNECTION}
        aria-keyshortcuts="Meta+Enter"
        onClick={onPress}
      >
        {state === 'expired' ? 'Ask again' : `Ask for approval · ${percent ?? ''}%`}
      </Button>
    )
  }
  if (state === 'waiting') {
    return (
      <Button variant="primary" size="lg" disabled>
        Waiting for approval
      </Button>
    )
  }
  if (state === 'declined') {
    return (
      <Button variant="primary" size="lg" onClick={onPress}>
        Change discount
      </Button>
    )
  }
  return (
    <Button
      variant="primary"
      size="lg"
      disabled={busy}
      loading={loading}
      aria-keyshortcuts="Meta+Enter"
      onClick={onPress}
    >
      Book{total ? ` · ${naira(total)}` : ''}
      <kbd className="ml-1 hidden text-xs opacity-80 lg:inline">⌘↵</kbd>
    </Button>
  )
}

// Review & book's line about the approval: waiting (with Cancel request), approved, declined
// (with Change discount) or expired (with Ask again and Change discount).
function ApprovalStatus({
  state,
  draft,
  quote,
  timeZone,
  online,
  onCancel,
  onChangeDiscount,
  onAskAgain,
}: {
  state: ReturnType<typeof approvalState>
  draft: Draft
  quote: { discount: { percent: string } | null } | undefined
  timeZone: string
  online: boolean
  onCancel: () => void
  onChangeDiscount: () => void
  onAskAgain: () => void
}) {
  const approval = draft.approval
  if (state === 'none') return null
  if (state === 'over_limit' || !approval) {
    return (
      <p role="status" className="rounded-sm bg-am-bg px-3 py-2 text-sm text-am">
        {quote?.discount?.percent}% is over your limit. Ask a manager to approve it: they can enter
        their PIN here or answer from their inbox.
        {online ? '' : ` ${NEEDS_CONNECTION}`}
      </p>
    )
  }
  const view = {
    status: approval.status,
    approver: { memberId: '', name: approval.approverName },
    requestedAt: approval.requestedAt,
    expiresAt: approval.expiresAt,
    answeredAt: approval.answeredAt,
    comment: approval.comment,
    subject: { percent: quote?.discount?.percent ?? '' } as never,
  }
  const line = answerLine(view, timeZone)
  const tone =
    state === 'approved'
      ? 'bg-em-bg text-em'
      : state === 'waiting'
        ? 'bg-bl-bg text-bl'
        : 'bg-am-bg text-am'
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm px-3 py-2 text-sm',
        tone,
      )}
    >
      <span className="num grow">{line}</span>
      {state === 'waiting' ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={!online}
          className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline lg:min-h-0"
        >
          Cancel request
        </button>
      ) : null}
      {state === 'declined' || state === 'expired' ? (
        <span className="flex gap-3">
          {state === 'expired' ? (
            <button
              type="button"
              onClick={onAskAgain}
              disabled={!online}
              className="inline-flex min-h-11 items-center font-medium hover:underline lg:min-h-0"
            >
              Ask again
            </button>
          ) : null}
          <button
            type="button"
            onClick={onChangeDiscount}
            className="inline-flex min-h-11 items-center font-medium hover:underline lg:min-h-0"
          >
            Change discount
          </button>
        </span>
      ) : null}
    </div>
  )
}
