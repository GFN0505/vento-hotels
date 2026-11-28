// The 60-second walk-in (design #6 WalkIn; spec "Walk-in"): a hotel page. Tonight to the departure
// for the party; 1 Room type (rooms left every night, ready rooms now, the first room picked), 2 Rate
// (plans open to anyone, the hotel's base plan first; Change rate is brick 4's discount, over the
// limit brick 5's approval), 3 Guest (phone finds returning guests, the registration and the ID
// photo), then the total with its tax lines and Check in to 302 (⌘↵): booked and checked in in one
// transaction. Online only: it needs live availability. The timer runs from opening.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  type ApprovalView,
  type AvailabilityRoomType,
  addDays,
  type BookablePlan,
  type CreateReservationInput,
  DESK_DISCOUNT_REASONS,
  DISCOUNT_REASON_LABELS,
  type DiscountReason,
  formatMoney,
  type GuestMatch,
  newId,
  nightsBetween,
  type Property,
  type RoomOption,
  rangeLabel,
  UNDO_SECONDS,
} from '@vento/shared'
import { AlertTriangle, Check, Clock3, LogIn, Search, WifiOff } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApprovalPrompt } from '@/components/approvals/approval-prompt'
import { Message } from '@/components/rooms/message'
import { PickHotel } from '@/components/shell/pick-hotel'
import { useLeaveGuard, useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page-header'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, errorData, isConnectionProblem, problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { useOnline } from '@/offline/connection'
import { IdPhoto, type IdPhotoChoice } from './id-photo'
import { printPdf, printPreferred, rememberPrint } from './print-card'
import { RegistrationFields } from './registration-form'
import {
  deskTime,
  emptyRegistration,
  problemsOf,
  type RegistrationForm,
  toInput,
} from './registration-model'

const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })
const STATUS_WORD = { inspected: 'Inspected', clean: 'Clean', dirty: 'Dirty' } as const

export function WalkInPage() {
  const me = useMe()
  const { scope } = useProperty()
  useScopedTitle('Walk-in')
  if (me.isPending || !scope) return null
  if (!me.can('stay.check_in') || !me.can('reservation.manage')) {
    return (
      <NoAccess
        what="walk-ins"
        ask="Only front desk, GMs and the owner can check guests in. Ask your GM."
      />
    )
  }
  if (scope.kind === 'all') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Walk-in" scope="pick" />
        <PickHotel title="Walk-ins are per hotel. Pick a hotel." />
      </div>
    )
  }
  return <HotelWalkIn key={scope.hotel.id} hotel={scope.hotel} />
}

function HotelWalkIn({ hotel }: { hotel: Property }) {
  const online = useOnline()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useMe()
  const arrival = hotel.businessDate
  const [departure, setDeparture] = useState(addDays(arrival, 1))
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [changing, setChanging] = useState(false)
  const [typeId, setTypeId] = useState<string>()
  const [roomId, setRoomId] = useState<string>()
  const [pickingRoom, setPickingRoom] = useState(false)
  const [planId, setPlanId] = useState<string>()
  const [discount, setDiscount] = useState<{
    value: string
    reason: DiscountReason | ''
    text: string
  } | null>(null)
  const [phone, setPhone] = useState('')
  const [match, setMatch] = useState<GuestMatch | null>(null)
  const [form, setForm] = useState<RegistrationForm>(() =>
    emptyRegistration({ firstName: '', lastName: '', nationality: 'NG' }),
  )
  const [photo, setPhoto] = useState<IdPhotoChoice>({ kind: 'none' })
  const [print, setPrint] = useState(printPreferred)
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [prompt, setPrompt] = useState(false)
  const [approval, setApproval] = useState<ApprovalView | null>(null)
  const key = useRef(newId())
  const documentId = useRef(newId())
  const opened = useRef(Date.now())
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const timer = setInterval(
      () => setSeconds(Math.round((Date.now() - opened.current) / 1000)),
      1000,
    )
    return () => clearInterval(timer)
  }, [])
  const touched = Boolean(typeId || phone || form.lastName || photo.kind !== 'none')
  // Changing hotel or leaving asks first (UX standard: the leave guard).
  useLeaveGuard(
    touched
      ? (proceed) => {
          if (window.confirm('Discard this walk-in?')) proceed()
        }
      : undefined,
  )

  const party = { adults, children }
  const availability = useQuery({
    ...orpc.reservations.availability.queryOptions({
      input: { propertyId: hotel.id, arrival, departure, ...party },
    }),
    enabled: online,
  })
  const options = useQuery({
    ...orpc.walkIn.options.queryOptions({ input: { propertyId: hotel.id, departure, ...party } }),
    enabled: online,
  })
  const rules = useQuery({
    ...orpc.ruleSets.current.queryOptions({ input: { propertyId: hotel.id } }),
    enabled: online,
  })
  const types = availability.data?.roomTypes ?? []
  const roomsOf = (id: string) => options.data?.types.find((t) => t.roomTypeId === id)?.rooms ?? []
  const type = types.find((t) => t.id === typeId)
  const plans = (type?.plans ?? []).filter((plan) => plan.terms.cancellation)
  const basePlanId = options.data?.basePlanId
  const plan =
    plans.find((p) => p.ratePlanId === planId) ??
    plans.find((p) => p.ratePlanId === basePlanId) ??
    plans[0]
  const room = typeId ? roomsOf(typeId).find((r) => r.id === roomId) : undefined

  // A type picked: its first room by brick 7's order (Inspected, Clean, then Dirty).
  const pickType = (next: AvailabilityRoomType) => {
    setTypeId(next.id)
    setRoomId(roomsOf(next.id)[0]?.id)
    setPlanId(undefined)
    setPickingRoom(false)
  }
  const discountInput =
    discount?.value && discount.reason
      ? {
          kind: 'percent' as const,
          value: discount.value,
          reason: discount.reason,
          ...(discount.reason === 'other' && discount.text ? { reasonText: discount.text } : {}),
        }
      : undefined
  const quote = useQuery({
    ...orpc.reservations.quote.queryOptions({
      input: {
        propertyId: hotel.id,
        roomTypeId: typeId ?? '',
        ratePlanId: plan?.ratePlanId ?? '',
        arrival,
        departure,
        ...party,
        nationality: form.nationality,
        ...(discountInput ? { discount: discountInput } : {}),
      },
    }),
    enabled: online && Boolean(typeId && plan),
    retry: false,
  })

  // Phone first: finds returning guests (masked results).
  const digits = phone.replace(/\D/g, '')
  const search = useQuery({
    ...orpc.guests.search.queryOptions({ input: { q: phone.trim() } }),
    enabled: online && digits.length >= 7 && !match,
  })
  const ruleLists = rules.data
    ? {
        lead: {
          required: rules.data.rules
            .filter((r) => r.audience === 'all' && r.required)
            .map((r) => r.field),
          optional: rules.data.rules
            .filter((r) => r.audience === 'all' && !r.required)
            .map((r) => r.field),
        },
        foreign: {
          required: rules.data.rules
            .filter((r) => r.audience !== 'all' && r.required)
            .map((r) => r.field),
          optional: rules.data.rules
            .filter((r) => r.audience !== 'all' && !r.required)
            .map((r) => r.field),
        },
      }
    : { lead: { required: [], optional: [] }, foreign: { required: [], optional: [] } }
  const photoRequired = ruleLists.lead.required.includes('id_document')
  const problems = problemsOf(form, ruleLists)
  const photoProblem =
    photoRequired && photo.kind === 'none' ? 'Take a photo of the ID, or upload a scan.' : undefined
  const nights = nightsBetween(arrival, departure)
  const overLimit = Boolean(quote.data?.discount && !quote.data.discount.within)

  const booking = (): CreateReservationInput | null => {
    if (!typeId || !plan || !quote.data || !roomId) return null
    return {
      idempotencyKey: key.current,
      propertyId: hotel.id,
      guest: match
        ? { kind: 'existing', id: match.id }
        : {
            kind: 'new',
            fields: {
              ...(form.title ? { title: form.title as never } : {}),
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
              ...(phone.trim() ? { phone: phone.trim() } : {}),
              nationality: form.nationality,
            },
          },
      source: 'direct',
      stays: [
        {
          roomTypeId: typeId,
          ratePlanId: plan.ratePlanId,
          arrival,
          departure,
          ...party,
          quoteHash: quote.data.quoteHash,
          roomId,
          ...(discountInput ? { discount: discountInput } : {}),
          ...(approval?.status === 'approved' ? { approvalId: approval.id } : {}),
        },
      ],
    }
  }

  async function checkIn() {
    if (saving) return
    setSubmitted(true)
    if (!online) return setFailure('Walk-ins need a connection to check live availability.')
    if (!typeId || !room) return setFailure('Pick a room type first.')
    if (!phone.trim() && !match)
      return setFailure('Enter a phone number, so the hotel can reach the guest.')
    if (Object.keys(problems).length) return setFailure(Object.values(problems)[0])
    if (photoProblem) return setFailure(photoProblem)
    if (overLimit && approval?.status !== 'approved') return setPrompt(true)
    const input = booking()
    if (!input) return
    setFailure(undefined)
    setSaving(true)
    try {
      if (photo.kind === 'file') {
        await api.registrations.uploadIdDocument({
          documentId: documentId.current,
          propertyId: hotel.id,
          contentType: photo.file.contentType,
          source: 'camera',
          data: photo.file.base64,
        })
      }
      const done = await api.walkIn.checkIn({
        booking: input,
        registrations: [toInput({ ...form, lead: true })],
        idDocument:
          photo.kind === 'file'
            ? { kind: 'uploaded', documentId: documentId.current }
            : photo.kind === 'reuse'
              ? { kind: 'reuse', documentId: photo.documentId }
              : photo.kind === 'skip'
                ? { kind: 'skip', reason: photo.reason.trim() }
                : { kind: 'none' },
        printCard: print,
        durationSeconds: seconds,
      })
      void queryClient.invalidateQueries({ queryKey: orpc.frontDesk.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.reservations.key() })
      if (done.cardUrl) printPdf(done.cardUrl)
      toast.success(`${done.guestName} checked in to ${done.room.number}`, {
        duration: UNDO_SECONDS * 1000,
        action: {
          label: 'Undo',
          onClick: () => {
            void api.checkIn
              .undo({ idempotencyKey: newId(), stayId: done.stayId, version: done.version })
              .then((undone) => {
                if (undone.bookingCancelled === false) {
                  toast.warning(
                    `Check-in undone. ${undone.guestName}'s booking is still open: cancel it from the reservation.`,
                  )
                } else toast.success('Walk-in undone and its booking cancelled')
                void queryClient.invalidateQueries({ queryKey: orpc.frontDesk.key() })
                void queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() })
              })
              .catch((error: unknown) => toast.error(problemMessage(error)))
          },
        },
      })
      void navigate({ to: '/front-desk' })
    } catch (error) {
      if (isConnectionProblem(error as { status?: number })) {
        setFailure(
          "Can't reach Vento. Nothing was saved yet; try again when the connection is back.",
        )
        return
      }
      key.current = newId()
      const code = errorCode(error)
      if (code === 'ROOM_TAKEN') {
        void options.refetch()
        const next = roomsOf(typeId).find((r) => r.id !== roomId)
        if (next) setRoomId(next.id)
        setFailure(
          `${room.number} was just taken.${next ? ` ${next.number} is ${STATUS_WORD[next.status].toLowerCase()}.` : ''}`,
        )
      } else if (code === 'SOLD_OUT') {
        void availability.refetch()
        setFailure(problemMessage(error))
      } else {
        setFailure(problemMessage(error) || String(errorData(error).code ?? ''))
      }
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void checkIn()
      }
      if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) {
        if (!touched || window.confirm('Discard this walk-in?'))
          void navigate({ to: '/front-desk' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const line = `Tonight · ${rangeLabel(arrival, departure, true)} · ${nights === 1 ? '1 night' : `${nights} nights`} · ${adults === 1 ? '1 adult' : `${adults} adults`}${children ? `, ${children === 1 ? '1 child' : `${children} children`}` : ''}`

  if (!online) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Walk-in" />
        <Card>
          <Message icon={WifiOff} title="Walk-ins need a connection to check live availability.">
            Arrivals already in a room can still be checked in from the Front desk list.
          </Message>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Walk-in"
        description={<span className="num">{line}</span>}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <span
              className="num inline-flex items-center gap-1.5 text-sm text-text-2"
              aria-live="off"
            >
              <Clock3 className="size-4" aria-hidden="true" />
              <span className="sr-only">Time at desk {deskTime(seconds)}</span>
              <span aria-hidden="true">
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
              </span>
            </span>
            <Button
              variant="ghost"
              className="max-lg:h-11"
              aria-expanded={changing}
              onClick={() => setChanging((v) => !v)}
            >
              Change dates
            </Button>
            <Button
              variant="ghost"
              className="max-lg:h-11"
              onClick={() => {
                if (!touched || window.confirm('Discard this walk-in?'))
                  void navigate({ to: '/front-desk' })
              }}
            >
              Discard <kbd className="ml-1 text-xs text-text-3 max-lg:hidden">esc</kbd>
            </Button>
          </span>
        }
      />
      {changing ? (
        <Card className="grid gap-3 p-4 sm:grid-cols-3">
          <Field
            label="Departure"
            type="date"
            value={departure}
            min={addDays(arrival, 1)}
            max={addDays(arrival, 30)}
            onChange={(event) => {
              if (event.target.value > arrival) setDeparture(event.target.value)
            }}
          />
          <SelectField
            label="Adults"
            value={String(adults)}
            options={['1', '2', '3', '4']}
            onChange={(event) => setAdults(Number(event.target.value))}
          />
          <SelectField
            label="Children"
            value={String(children)}
            options={['0', '1', '2', '3']}
            onChange={(event) => setChildren(Number(event.target.value))}
          />
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Step n={1} title="Room type" done={Boolean(room)}>
          {availability.isPending ? (
            <Lines />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {types.map((t) => {
                const list = roomsOf(t.id)
                const ready = list.filter((r) => r.status !== 'dirty').length
                const disabled = !t.sellable || list.length === 0
                const words =
                  t.reason === 'too_many_guests'
                    ? `Sleeps ${t.maxAdults} ${t.maxAdults === 1 ? 'adult' : 'adults'}${t.maxChildren ? ` and ${t.maxChildren} ${t.maxChildren === 1 ? 'child' : 'children'}` : ''}`
                    : t.soldOut[0]
                      ? `Sold out ${rangeLabel(t.soldOut[0], addDays(t.soldOut[0], 1)).split('–')[0]}`
                      : ready
                        ? `${ready} ready · ${list[0]?.number ?? ''} first`
                        : `${t.lowest.left} left, none ready`
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={typeId === t.id}
                      onClick={() => pickType(t)}
                      className={cn(
                        'flex min-h-14 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60',
                        typeId === t.id
                          ? 'border-pri bg-pri-soft/60'
                          : 'border-border hover:bg-surface-2/60',
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{t.name}</span>
                        <span className="text-sm text-text-2">{words}</span>
                      </span>
                      <span className="num flex-none text-sm">
                        {t.from ? (
                          <>
                            {naira(t.from)} <span className="text-text-3">incl. taxes</span>
                          </>
                        ) : (
                          '–'
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {room ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
              <span className="text-text-2">Room</span>
              <span className="num font-semibold">{room.number}</span>
              <StatusBadge tone={room.status === 'dirty' ? 'amber' : 'emerald'}>
                {STATUS_WORD[room.status]}
              </StatusBadge>
              <Button
                size="sm"
                variant="ghost"
                className="max-lg:h-11"
                onClick={() => setPickingRoom((v) => !v)}
              >
                Change
              </Button>
            </div>
          ) : null}
          {room?.status === 'dirty' ? (
            <p className="text-sm text-am">
              {room.number} is dirty. The guest can register now and get the key when it's clean.
            </p>
          ) : null}
          {pickingRoom && typeId ? (
            <RoomPicker
              rooms={roomsOf(typeId)}
              value={roomId}
              onPick={(id) => {
                setRoomId(id)
                setPickingRoom(false)
              }}
            />
          ) : null}
        </Step>

        <Step n={2} title="Rate" done={Boolean(plan && quote.data)}>
          {!type ? (
            <p className="text-sm text-text-3">Pick a room type first.</p>
          ) : (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="sr-only">Rate plan</legend>
              {plans.map((p: BookablePlan) => (
                <label
                  key={p.ratePlanId}
                  className={cn(
                    'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-2',
                    plan?.ratePlanId === p.ratePlanId
                      ? 'border-pri bg-pri-soft/60'
                      : 'border-border hover:bg-surface-2/60',
                  )}
                >
                  <input
                    type="radio"
                    name="walk-in-plan"
                    className="size-4 accent-[var(--pri)]"
                    checked={plan?.ratePlanId === p.ratePlanId}
                    onChange={() => setPlanId(p.ratePlanId)}
                  />
                  <span className="flex min-w-0 grow flex-col">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-sm text-text-2">
                      {p.derivedLabel ??
                        (p.mealPlan === 'room_only' ? 'Room only' : 'Breakfast included')}
                    </span>
                  </span>
                  {/* What the guest hears: the all-in price, whatever the plan's basis (0032). */}
                  <span className="num flex flex-col items-end text-sm">
                    {naira(p.perNightIncl)}
                    <span className="text-xs text-text-3">a night incl. taxes</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {type ? (
            discount ? (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <Field
                  label="Discount (%)"
                  inputMode="decimal"
                  value={discount.value}
                  hint="e.g. 15"
                  onChange={(event) => setDiscount({ ...discount, value: event.target.value })}
                />
                <SelectField
                  label="Reason"
                  value={discount.reason}
                  placeholder="Pick a reason"
                  options={DESK_DISCOUNT_REASONS.map((value) => ({
                    value,
                    label: DISCOUNT_REASON_LABELS[value],
                  }))}
                  onChange={(event) =>
                    setDiscount({ ...discount, reason: event.target.value as DiscountReason })
                  }
                />
                {discount.reason === 'other' ? (
                  <Field
                    label="Say why"
                    value={discount.text}
                    onChange={(event) => setDiscount({ ...discount, text: event.target.value })}
                  />
                ) : null}
                {overLimit && quote.data?.discount ? (
                  <p className="text-sm text-am">
                    {quote.data.discount.percent}% is over your {quote.data.discount.limit ?? '0'}%
                    discount limit. A manager can approve it.
                  </p>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-fit max-lg:h-11"
                  onClick={() => setDiscount(null)}
                >
                  Remove discount
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 border-t border-border pt-3 text-sm">
                <Button
                  size="sm"
                  variant="ghost"
                  className="max-lg:h-11"
                  onClick={() => setDiscount({ value: '', reason: '', text: '' })}
                >
                  Change rate
                </Button>
                <span className="text-text-3">reason required</span>
              </div>
            )
          ) : null}
        </Step>

        <Step
          n={3}
          title="Guest"
          done={Object.keys(problems).length === 0 && Boolean(form.lastName)}
        >
          <Field
            label="Phone · finds returning guests"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            hint={
              match
                ? `Returning guest · ${match.firstName} ${match.lastName}`
                : 'e.g. 0803 412 7790'
            }
            onChange={(event) => {
              setPhone(event.target.value)
              setMatch(null)
            }}
          />
          {!match && search.data?.length ? (
            <ul aria-label="Returning guests" className="flex flex-col gap-1">
              {search.data.slice(0, 3).map((guest) => (
                <li key={guest.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setMatch(guest)
                      setForm({
                        ...form,
                        title: guest.title ?? form.title,
                        firstName: guest.firstName,
                        lastName: guest.lastName,
                        nationality: guest.nationality,
                      })
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-left text-sm hover:bg-surface-2/60"
                  >
                    <span className="font-medium">
                      {guest.firstName} {guest.lastName}
                    </span>
                    <span className="num text-text-3">
                      {guest.maskedPhone ?? guest.maskedEmail}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : digits.length >= 7 && !match && search.data ? (
            <p className="flex items-center gap-1.5 text-sm text-text-3">
              <Search className="size-3.5" aria-hidden="true" /> No returning guest with that
              number.
            </p>
          ) : null}
        </Step>
      </div>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="font-semibold">Registration</h2>
        <RegistrationFields
          idPrefix="walk-in"
          form={form}
          onChange={setForm}
          rules={ruleLists}
          showErrors={submitted}
        />
        <h3 className="font-medium">ID photo</h3>
        <IdPhoto
          idPrefix="walk-in-id"
          value={photo}
          onChange={setPhoto}
          required={photoRequired}
          canSkip={me.can('guest.id_skip')}
          error={submitted ? photoProblem : undefined}
        />
      </Card>

      <Card className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 p-4 max-sm:bottom-[env(safe-area-inset-bottom)]">
        <dl className="num flex flex-wrap gap-x-6 gap-y-2">
          {quote.data ? (
            <>
              {/* All-in plans (the default, decision 0032) lead with the total and show the
                  taxes inside it; plans priced before taxes add them up to the total. */}
              {quote.data.terms.pricesIncludeTaxes ? (
                <div className="flex flex-col">
                  <dt className="text-xs font-semibold text-text-3 uppercase">Total</dt>
                  <dd className="text-lg font-semibold">{naira(quote.data.totals.total)}</dd>
                </div>
              ) : null}
              <div className="flex flex-col">
                <dt className="text-xs font-semibold text-text-3 uppercase">
                  {quote.data.terms.pricesIncludeTaxes ? 'Includes room' : 'Room'}
                </dt>
                <dd>{naira(quote.data.totals.net)}</dd>
              </div>
              {quote.data.totals.lines.map((l) => (
                <div key={l.key} className="flex flex-col">
                  <dt className="text-xs font-semibold text-text-3 uppercase">
                    {l.name} {l.ratePercent}%
                  </dt>
                  <dd>{naira(l.amount)}</dd>
                </div>
              ))}
              {quote.data.totals.rounding !== '0.00' ? (
                <div className="flex flex-col">
                  <dt className="text-xs font-semibold text-text-3 uppercase">Rounding</dt>
                  <dd>{naira(quote.data.totals.rounding)}</dd>
                </div>
              ) : null}
              {quote.data.terms.pricesIncludeTaxes ? null : (
                <div className="flex flex-col">
                  <dt className="text-xs font-semibold text-text-3 uppercase">Total</dt>
                  <dd className="text-lg font-semibold">{naira(quote.data.totals.total)}</dd>
                </div>
              )}
              {quote.data.fx ? (
                <div className="self-end text-sm text-text-2">{quote.data.fx.text}</div>
              ) : null}
            </>
          ) : (
            <div className="text-text-2">
              {typeId ? 'Pricing…' : 'Pick a room type to see the total.'}
            </div>
          )}
        </dl>
        <div className="flex flex-col items-end gap-2 max-sm:w-full max-sm:items-stretch">
          <span className="inline-flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
            <Checkbox
              id="walk-in-print"
              checked={print}
              onChange={(event) => {
                setPrint(event.target.checked)
                rememberPrint(event.target.checked)
              }}
            />
            <label htmlFor="walk-in-print">Print registration card</label>
          </span>
          <Button
            variant="primary"
            size="lg"
            className="max-lg:h-12"
            loading={saving}
            disabled={!room || !quote.data}
            onClick={() => void checkIn()}
            aria-keyshortcuts="Meta+Enter"
          >
            <LogIn className="size-4" aria-hidden="true" />
            {overLimit && approval?.status !== 'approved'
              ? `Ask for approval · ${quote.data?.discount?.percent ?? ''}%`
              : room
                ? `Check in to ${room.number}`
                : 'Check in'}
            <kbd className="ml-1 hidden rounded-[4px] bg-white/20 px-1.5 text-xs lg:inline">⌘↵</kbd>
          </Button>
          {failure ? (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-ro">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {failure}
            </p>
          ) : null}
          {approval?.status === 'approved' ? (
            <p className="flex items-center gap-1.5 text-sm text-em">
              <Check className="size-4" aria-hidden="true" /> Approved by {approval.approver?.name}
            </p>
          ) : approval?.status === 'pending' ? (
            <p className="text-sm text-bl">
              Asked {approval.approver?.name ?? 'a manager'}. Check in when they approve.
            </p>
          ) : null}
        </div>
      </Card>

      {prompt && booking() ? (
        <ApprovalPrompt
          action={{
            kind: 'stay_discount',
            booking: booking() as CreateReservationInput,
            stayIndex: 0,
          }}
          timeZone={hotel.timeZone}
          approveLabel={`Approve ${quote.data?.discount?.percent ?? ''}% and check in`}
          onClose={() => setPrompt(false)}
          onApproved={(view) => {
            setApproval(view)
            setPrompt(false)
            setTimeout(() => void checkIn(), 0)
          }}
          onSent={(view) => {
            setApproval(view)
            setPrompt(false)
            toast.success(`Sent to ${view.approver?.name ?? 'the manager'}`)
          }}
        />
      ) : null}
    </div>
  )
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number
  title: string
  done: boolean
  children: ReactNode
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <kbd className="grid size-6 place-items-center rounded-[6px] border border-border bg-surface-2 text-sm">
            {n}
          </kbd>
          <span className="font-semibold">{title}</span>
        </span>
        {done ? <StatusBadge tone="emerald">Done</StatusBadge> : null}
      </h2>
      {children}
    </Card>
  )
}

function RoomPicker({
  rooms,
  value,
  onPick,
}: {
  rooms: RoomOption[]
  value: string | undefined
  onPick: (id: string) => void
}) {
  return (
    <ul aria-label="Rooms" className="grid max-h-60 grid-cols-2 gap-1.5 overflow-y-auto">
      {rooms.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            aria-pressed={value === r.id}
            onClick={() => onPick(r.id)}
            className={cn(
              'flex min-h-11 w-full items-center justify-between rounded-md border px-2.5 text-sm',
              value === r.id ? 'border-pri bg-pri-soft/60' : 'border-border',
            )}
          >
            <span className="num font-semibold">{r.number}</span>
            <span className="text-text-2">{STATUS_WORD[r.status]}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Lines() {
  return (
    <div role="status" aria-label="Loading room types" className="flex flex-col gap-1.5">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="h-14 animate-pulse rounded-md bg-surface-2" />
      ))}
    </div>
  )
}
