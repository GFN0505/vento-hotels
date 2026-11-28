// The check-in sheet (design #6 CheckIn; spec "Check-in (#6)"): Verify ID, Registration, Room,
// opening at the first step with something missing. The aside keeps the room, its readiness, the
// stay and the time at the desk in view. Check in saves the ID photo first, then the check-in, with
// one key per sheet, so a resend after a dropped connection is never a second check-in. Offline, an
// arrival already in a room is checked in on the device and queued (decision 0009): the typed
// numbers and the photo travel sealed until the server answers.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type CheckedIn,
  type CheckInPrepare,
  type FrontDeskRow,
  formatMoney,
  ID_TYPE_LABELS,
  isForeign,
  newId,
  ROOM_OPTIONS_SHOWN,
  type RoomOption,
  type RuleSet,
  rangeLabel,
  UNDO_SECONDS,
} from '@vento/shared'
import { AlertTriangle, ArrowLeftRight, Check, Clock3, LogIn } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Message } from '@/components/rooms/message'
import { RoomMoveDialog } from '@/components/rooms/room-move-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Sheet } from '@/components/ui/sheet'
import { StatusBadge } from '@/components/ui/status-badge'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, isConnectionProblem, problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { useOnline } from '@/offline/connection'
import { enqueue } from '@/offline/outbox'
import { seal } from '@/offline/sealed'
import { IdPhoto, type IdPhotoChoice } from './id-photo'
import { printPdf, printPreferred, rememberPrint } from './print-card'
import { RegistrationFields } from './registration-form'
import {
  deskTime,
  emptyRegistration,
  fromPrevious,
  problemsOf,
  type RegistrationForm,
  type Rules,
  toInput,
  warningsOf,
} from './registration-model'

type Step = 'id' | 'registration' | 'room'
const STEPS: { key: Step; label: string }[] = [
  { key: 'id', label: 'Verify ID' },
  { key: 'registration', label: 'Registration' },
  { key: 'room', label: 'Room' },
]

const STATUS_TONE = { inspected: 'emerald', clean: 'emerald', dirty: 'amber' } as const
const STATUS_WORD = { inspected: 'Inspected', clean: 'Clean', dirty: 'Dirty' } as const

// The rules as the sheet reads them: from the prepare answer, or (offline) the cached rule set.
function rulesFrom(set: RuleSet | undefined): Rules {
  const of = (audiences: string[]) => {
    const rules = (set?.rules ?? []).filter((rule) => audiences.includes(rule.audience))
    return {
      required: rules.filter((r) => r.required).map((r) => r.field),
      optional: rules.filter((r) => !r.required).map((r) => r.field),
    }
  }
  return { lead: of(['all']), foreign: of(['foreign', 'ecowas']) }
}

export type CheckInTarget = {
  stayId: string
  propertyId: string
  // The arrival as the list shows it: enough to check in offline.
  row?: FrontDeskRow
  businessDate: string
}

export function CheckInSheet({
  target,
  onClose,
  startAt,
}: {
  target: CheckInTarget
  onClose: () => void
  // "Pick another room" opens at the Room step.
  startAt?: Step
}) {
  const online = useOnline()
  const me = useMe()
  const queryClient = useQueryClient()
  const prepared = useQuery({
    ...orpc.checkIn.prepare.queryOptions({ input: { stayId: target.stayId } }),
    enabled: online,
    retry: false,
  })
  const cachedRules = useQuery({
    ...orpc.ruleSets.current.queryOptions({ input: { propertyId: target.propertyId } }),
    staleTime: 60 * 60 * 1000,
  })
  const data = prepared.data
  const row = target.row
  const offline =
    !online ||
    (!data && prepared.isError && isConnectionProblem(prepared.error as { status?: number }))
  const rules = data ? data.rules : rulesFrom(cachedRules.data)
  const leadRequiresPhoto = rules.lead.required.includes('id_document')
  const guest = data?.guest ?? (row ? splitName(row) : undefined)

  const [step, setStep] = useState<Step | undefined>(startAt)
  const [form, setForm] = useState<RegistrationForm>()
  const [photo, setPhoto] = useState<IdPhotoChoice>({ kind: 'none' })
  const [roomId, setRoomId] = useState<string>()
  const [showAll, setShowAll] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [print, setPrint] = useState(printPreferred)
  const [moving, setMoving] = useState(false)
  const [dirty, setDirty] = useState(false)
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

  // The form starts from the guest (and a returning guest's earlier registration) once known.
  useEffect(() => {
    // Online, the sheet waits for prepare (the earlier registration and photo come with it).
    if (form || !guest || (!data && !offline)) return
    const start = emptyRegistration(guest)
    setForm(data?.previous ? fromPrevious(start, data.previous) : start)
    if (data?.previous?.reusableDocument) {
      setPhoto({ kind: 'reuse', documentId: data.previous.reusableDocument.id })
    }
    if (data?.room && !data.room.problem) setRoomId(data.room.id)
    else if (!data && row?.room) setRoomId(row.room.id)
  }, [form, guest, data, row, offline])
  // It opens at the first step with something missing.
  useEffect(() => {
    if (step || !form) return
    const photoMissing = leadRequiresPhoto && photo.kind === 'none'
    const formProblems = Object.keys(problemsOf(form, rules)).length > 0
    setStep(photoMissing ? 'id' : formProblems ? 'registration' : 'room')
  }, [step, form, photo, rules, leadRequiresPhoto])

  const guard = useDiscardGuard(dirty, onClose)
  const update = (next: RegistrationForm) => {
    setForm(next)
    setDirty(true)
  }

  const roomLine = useMemo(() => {
    if (data) {
      const chosen =
        roomId && data.room?.id === roomId
          ? { number: data.room.number, status: data.room.status }
          : data.rooms.find((r) => r.id === roomId)
      return chosen ?? null
    }
    return row?.room ? { number: row.room.number, status: row.room.status } : null
  }, [data, row, roomId])

  if (!online && !row) {
    return (
      <Sheet open onClose={onClose} title="Check in" size="lg">
        <Message icon={AlertTriangle} title="Checking in this guest needs a connection.">
          Open the Front desk list: arrivals already in a room can be checked in offline.
        </Message>
      </Sheet>
    )
  }
  if (!form || !guest || (!data && !offline)) {
    return (
      <Sheet open onClose={onClose} title="Check in" size="lg">
        {prepared.isError ? (
          <Message icon={AlertTriangle} title={problemMessage(prepared.error)} alert>
            <Button onClick={() => prepared.refetch()}>Try again</Button>
          </Message>
        ) : (
          <div role="status" aria-label="Loading the check-in" className="flex flex-col gap-3">
            <span className="h-24 animate-pulse rounded-md bg-surface-2" />
            <span className="h-40 animate-pulse rounded-md bg-surface-2" />
          </div>
        )}
      </Sheet>
    )
  }

  const name = `${form.firstName} ${form.lastName}`.trim() || `${guest.firstName} ${guest.lastName}`
  const stay = data?.stay
  const arrival = stay?.arrival ?? row?.arrival ?? target.businessDate
  const departure = stay?.departure ?? row?.departure ?? target.businessDate
  const nights = stay?.nights ?? row?.nights ?? 1
  const number = stay?.number ?? row?.number ?? ''
  const blocked = data?.blocked ?? row?.checkInBlocked ?? null
  const problems = problemsOf(form, rules)
  const warnings = warningsOf(form, { departure, today: target.businessDate })
  const photoProblem =
    leadRequiresPhoto && photo.kind === 'none'
      ? 'Take a photo of the ID, or upload a scan.'
      : photo.kind === 'skip' && photo.reason.trim().length < 3
        ? "Say why there's no ID photo."
        : undefined
  const notReady =
    data && roomId === data.room?.id
      ? data.room?.notReady
      : roomLine?.status === 'dirty'
        ? `${roomLine.number} is dirty. The guest can register now and get the key when it's clean.`
        : null
  const roomProblem = data && roomId === data.room?.id ? data.room?.problem : null
  const index = STEPS.findIndex((s) => s.key === step)
  const primary =
    step === 'id'
      ? 'Continue to registration'
      : step === 'registration'
        ? 'Continue to room'
        : roomLine
          ? `Check in to ${roomLine.number}${notReady ? ' · room not ready' : ''}`
          : 'Check in'

  async function checkInNow() {
    if (!form || saving) return
    setSubmitted(true)
    if (photoProblem) return setStep('id')
    if (Object.keys(problems).length) {
      setStep('registration')
      setFailure(Object.values(problems)[0])
      return
    }
    if (!roomId) {
      setFailure('Pick a room first.')
      return setStep('room')
    }
    setFailure(undefined)
    setSaving(true)
    const registrations = [toInput(form)]
    const occurredAt = new Date().toISOString()
    try {
      if (offline) {
        await queueOffline(registrations, occurredAt)
        return
      }
      let idDocument: Parameters<typeof api.checkIn.checkIn>[0]['idDocument'] = { kind: 'none' }
      if (photo.kind === 'file') {
        await api.registrations.uploadIdDocument({
          documentId: documentId.current,
          propertyId: target.propertyId,
          contentType: photo.file.contentType,
          source: 'camera',
          data: photo.file.base64,
        })
        idDocument = { kind: 'uploaded', documentId: documentId.current }
      } else if (photo.kind === 'reuse') {
        idDocument = { kind: 'reuse', documentId: photo.documentId }
      } else if (photo.kind === 'skip') {
        idDocument = { kind: 'skip', reason: photo.reason.trim() }
      }
      const done = await api.checkIn.checkIn({
        idempotencyKey: key.current,
        stayId: target.stayId,
        version: stay?.version ?? row?.version ?? 1,
        roomId,
        registrations,
        idDocument,
        printCard: print,
        occurredAt,
        businessDate: target.businessDate,
        durationSeconds: seconds,
        source: 'arrivals',
      })
      finished(done)
    } catch (error) {
      if (isConnectionProblem(error as { status?: number })) {
        setFailure(
          'Checking whether the guest was checked in… Try again when the connection is back.',
        )
        return
      }
      key.current = newId()
      const code = errorCode(error)
      if (code === 'REGISTRATION_INCOMPLETE') setStep('registration')
      if (code === 'ID_DOCUMENT_REQUIRED' || code?.startsWith('ID_DOCUMENT')) setStep('id')
      if (code === 'ROOM_TAKEN' || code === 'ROOM_OUT_OF_ORDER' || code === 'ROOM_TOO_SMALL') {
        setStep('room')
        void prepared.refetch()
      }
      setFailure(problemMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function finished(done: CheckedIn) {
    void queryClient.invalidateQueries({ queryKey: orpc.frontDesk.key() })
    void queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() })
    void queryClient.invalidateQueries({ queryKey: orpc.reservations.key() })
    if (done.cardUrl) printPdf(done.cardUrl)
    onClose()
    toast.success(`${done.guestName} checked in to ${done.room.number}`, {
      duration: UNDO_SECONDS * 1000,
      action: {
        label: 'Undo',
        onClick: () => {
          void api.checkIn
            .undo({ idempotencyKey: newId(), stayId: done.stayId, version: done.version })
            .then(() => {
              toast.success('Check-in undone')
              void queryClient.invalidateQueries({ queryKey: orpc.frontDesk.key() })
              void queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() })
              void queryClient.invalidateQueries({ queryKey: orpc.reservations.key() })
            })
            .catch((error: unknown) => toast.error(problemMessage(error)))
        },
      },
    })
  }

  async function queueOffline(registrations: ReturnType<typeof toInput>[], occurredAt: string) {
    if (!roomId || !roomLine) return
    const sealed = await seal({
      registrations,
      idDocument:
        photo.kind === 'file'
          ? { kind: 'uploaded', documentId: documentId.current }
          : photo.kind === 'skip'
            ? { kind: 'skip', reason: photo.reason.trim() }
            : { kind: 'none' },
      ...(photo.kind === 'file'
        ? {
            photo: {
              documentId: documentId.current,
              contentType: photo.file.contentType,
              base64: photo.file.base64,
            },
          }
        : {}),
    })
    await enqueue({
      kind: 'stays.checkIn',
      input: {
        idempotencyKey: key.current,
        stayId: target.stayId,
        version: row?.version ?? 1,
        roomId,
        printCard: false,
        occurredAt,
        businessDate: target.businessDate,
        durationSeconds: seconds,
        source: 'offline',
        propertyId: target.propertyId,
      },
      sealed,
      memberId: me.data?.member.id ?? '',
      label: `${name} checked in to ${roomLine.number}`,
      guestName: name,
      roomNumber: roomLine.number,
    })
    onClose()
    toast.success(`${name} checked in · Will sync`)
  }

  const next = () => {
    if (step === 'id') {
      if (photoProblem) {
        setSubmitted(true)
        return
      }
      return setStep('registration')
    }
    if (step === 'registration') {
      if (Object.keys(problems).length) {
        setSubmitted(true)
        setFailure(Object.values(problems)[0])
        return
      }
      setFailure(undefined)
      return setStep('room')
    }
    void checkInNow()
  }
  const back = () => {
    if (index > 0) setStep(STEPS[index - 1]?.key)
  }

  const rooms = data?.rooms ?? []
  const shownRooms = showAll ? rooms : rooms.slice(0, ROOM_OPTIONS_SHOWN)
  const price = stay
    ? `${formatMoney({ amount: stay.pricePerNight, currency: 'NGN' })} a night ${stay.pricesIncludeTaxes ? 'incl.' : 'excl.'} taxes`
    : null

  return (
    <>
      <Sheet
        open={!moving}
        onClose={guard.close}
        title={`Check in · ${name}`}
        description={
          <span className="num">
            {[
              number,
              roomLine?.number,
              `${rangeLabel(arrival, departure, true)} · ${nights === 1 ? '1 night' : `${nights} nights`}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        }
        size="xl"
        footer={
          guard.bar ?? (
            <div className="flex w-full flex-col gap-2">
              {failure ? (
                <p role="alert" className="text-sm text-ro">
                  {failure}
                </p>
              ) : null}
              <div className="flex w-full flex-wrap items-center justify-between gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
                <Button
                  className="max-lg:h-11"
                  disabled={index <= 0}
                  onClick={back}
                  aria-keyshortcuts="Meta+ArrowLeft"
                >
                  Back
                </Button>
                <div className="flex flex-wrap items-center gap-3 max-sm:flex-col max-sm:items-stretch">
                  {step === 'room' ? (
                    <span className="inline-flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
                      <Checkbox
                        id="check-in-print"
                        checked={print && !offline}
                        disabled={offline}
                        onChange={(event) => {
                          setPrint(event.target.checked)
                          rememberPrint(event.target.checked)
                        }}
                      />
                      <label htmlFor="check-in-print">
                        {offline
                          ? "Print available when you're back online"
                          : 'Print registration card'}
                      </label>
                    </span>
                  ) : null}
                  <Button
                    variant="primary"
                    size="lg"
                    className="max-lg:h-11"
                    loading={saving}
                    disabled={Boolean(blocked) || (step === 'room' && Boolean(roomProblem))}
                    onClick={next}
                  >
                    {step === 'room' ? <LogIn className="size-4" aria-hidden="true" /> : null}
                    {primary}
                  </Button>
                </div>
              </div>
            </div>
          )
        }
      >
        <form
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"
          onSubmit={(event) => {
            event.preventDefault()
            next()
          }}
          onKeyDown={(event) => {
            if (event.metaKey && event.key === 'ArrowLeft') {
              event.preventDefault()
              back()
            }
          }}
        >
          <div className="flex min-w-0 flex-col gap-5">
            <nav aria-label="Steps" className="flex flex-wrap gap-1.5">
              {STEPS.map((item, i) => {
                const done = i < index
                const current = item.key === step
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    onClick={() => setStep(item.key)}
                    className={cn(
                      'inline-flex h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium lg:h-8',
                      current
                        ? 'border-pri bg-pri-soft text-pri-ink'
                        : done
                          ? 'border-border bg-surface text-text'
                          : 'border-border bg-surface text-text-2',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-full text-[11px] font-semibold',
                        current
                          ? 'bg-pri text-white'
                          : done
                            ? 'bg-em-dot text-white'
                            : 'bg-surface-3 text-text-2',
                      )}
                      aria-hidden="true"
                    >
                      {done ? <Check className="size-3" /> : i + 1}
                    </span>
                    {item.label}
                  </button>
                )
              })}
            </nav>
            {blocked ? (
              <p role="alert" className="rounded-sm bg-am-bg px-3 py-2 text-am">
                {blocked}
              </p>
            ) : null}
            {offline ? (
              <p role="status" className="rounded-sm bg-am-bg px-3 py-2 text-sm text-am">
                Offline: this check-in saves on this computer and syncs later. Every required field
                is typed here; picking another room needs a connection.
              </p>
            ) : null}

            {step === 'id' ? (
              <IdPhoto
                idPrefix="check-in-id"
                value={photo}
                onChange={(value) => {
                  setPhoto(value)
                  setDirty(true)
                }}
                required={leadRequiresPhoto}
                onFile={
                  data?.previous?.reusableDocument
                    ? {
                        documentId: data.previous.reusableDocument.id,
                        line: `ID photo on file from ${dateOnly(data.previous.reusableDocument.capturedAt, data.hotel.timeZone)}${data.previous.idType && data.previous.idNumberMasked ? ` · ${ID_TYPE_LABELS[data.previous.idType]} ${data.previous.idNumberMasked}` : ''}`,
                      }
                    : undefined
                }
                canSkip={Boolean(data?.can.skipIdDocument)}
                error={submitted ? photoProblem : undefined}
              />
            ) : null}

            {step === 'registration' ? (
              <>
                {data?.previous ? (
                  <p className="text-sm text-text-2">
                    From the stay on {dateOnly(data.previous.arrival)} at {data.previous.hotelName}.
                  </p>
                ) : null}
                <RegistrationFields
                  idPrefix="check-in"
                  form={form}
                  onChange={update}
                  rules={rules}
                  showErrors={submitted}
                  reusedFrom={
                    data?.previous
                      ? `From the stay on ${dateOnly(data.previous.arrival)} at ${data.previous.hotelName}`
                      : undefined
                  }
                />
                {warnings.map((warning) => (
                  <p key={warning} className="rounded-sm bg-am-bg px-3 py-2 text-sm text-am">
                    {warning}
                  </p>
                ))}
                <p className="text-sm text-text-2">
                  Check the guest's ID matches before you check in.
                </p>
              </>
            ) : null}

            {step === 'room' ? (
              <RoomStep
                data={data}
                row={row}
                roomId={roomId}
                onRoom={(id) => {
                  setRoomId(id)
                  setDirty(true)
                }}
                rooms={shownRooms}
                more={rooms.length - shownRooms.length}
                onShowAll={() => setShowAll(true)}
                notReady={notReady ?? null}
                problem={roomProblem ?? null}
                online={!offline}
                onUpgrade={() => setMoving(true)}
              />
            ) : null}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </div>

          <aside className="flex flex-col gap-4 rounded-md border border-border bg-surface-2/50 p-4 lg:self-start">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wide text-text-3 uppercase">
                Room
              </span>
              {roomLine ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="num text-md font-semibold">
                    {roomLine.number} · {stay?.roomTypeName ?? row?.roomTypeName}
                  </span>
                  <StatusBadge tone={STATUS_TONE[roomLine.status]}>
                    {STATUS_WORD[roomLine.status]}
                  </StatusBadge>
                </div>
              ) : (
                <span className="text-text-2">Not in a room yet</span>
              )}
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold tracking-wide text-text-3 uppercase">
                Stay
              </span>
              <span className="num">
                Leaves {dateOnly(departure)} · {nights === 1 ? '1 night' : `${nights} nights`}
              </span>
              {stay ? (
                <span className="num text-text-2">
                  {stay.planName} · {price}
                </span>
              ) : null}
              {isForeign(form.nationality) ? (
                <span className="text-text-2">
                  Foreign national: passport and visa details apply.
                </span>
              ) : null}
              {data?.early ? (
                <span className="text-am">Early check-in · before {data.hotel.checkInTime}</span>
              ) : null}
              {stay?.notes ? <span className="text-text-2">“{stay.notes}”</span> : null}
            </div>
            <div className="flex items-center gap-2 text-sm text-text-2">
              <Clock3 className="size-4" aria-hidden="true" />
              Time at desk <span className="num font-medium text-text">{deskTime(seconds)}</span>
            </div>
          </aside>
        </form>
      </Sheet>
      {moving && data ? (
        <RoomMoveDialog
          stayId={data.stay.id}
          version={data.stay.version}
          timeZone={data.hotel.timeZone}
          onClose={() => setMoving(false)}
          onDone={() => {
            setRoomId(undefined)
            setForm(undefined)
            void prepared.refetch()
          }}
        />
      ) : null}
    </>
  )
}

function RoomStep({
  data,
  row,
  roomId,
  onRoom,
  rooms,
  more,
  onShowAll,
  notReady,
  problem,
  online,
  onUpgrade,
}: {
  data: CheckInPrepare | undefined
  row: FrontDeskRow | undefined
  roomId: string | undefined
  onRoom: (id: string) => void
  rooms: RoomOption[]
  more: number
  onShowAll: () => void
  notReady: string | null
  problem: string | null
  online: boolean
  onUpgrade: () => void
}) {
  const [changing, setChanging] = useState(!data?.room || Boolean(data.room.problem))
  const assigned = data?.room ?? (row?.room ? { ...row.room, notReady: null, problem: null } : null)
  return (
    <div className="flex flex-col gap-4">
      {assigned ? (
        <label
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-md border p-4',
            roomId === assigned.id ? 'border-pri bg-pri-soft/50' : 'border-border',
          )}
        >
          <input
            type="radio"
            name="check-in-room"
            checked={roomId === assigned.id}
            onChange={() => onRoom(assigned.id)}
            className="size-4 accent-[var(--pri)]"
            disabled={Boolean(assigned.problem)}
          />
          <span className="flex min-w-0 grow flex-col">
            <span className="num font-semibold">
              {assigned.number} · {data?.stay.roomTypeName ?? row?.roomTypeName}
            </span>
            <span className="text-sm text-text-2">
              {STATUS_WORD[assigned.status]}
              {assigned.statusBy ? ` · ${assigned.statusBy}` : ''}
              {assigned.statusAt ? ` · ${clock(assigned.statusAt, data?.hotel.timeZone)}` : ''}
            </span>
          </span>
          <StatusBadge tone={STATUS_TONE[assigned.status]}>
            {STATUS_WORD[assigned.status]}
          </StatusBadge>
        </label>
      ) : null}
      {problem ? (
        <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-sm text-ro">
          {problem}
        </p>
      ) : null}
      {notReady ? (
        <p className="rounded-sm bg-am-bg px-3 py-2 text-sm text-am">{notReady}</p>
      ) : null}
      {!online ? (
        <p className="text-sm text-text-3">Picking a room needs a connection.</p>
      ) : data && !changing && assigned ? (
        <Button className="w-fit max-lg:h-11" onClick={() => setChanging(true)}>
          Change room
        </Button>
      ) : null}
      {online && data && (changing || !assigned) ? (
        rooms.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-text-2">
              Ready rooms first · {data.stay.roomTypeName}
            </legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {rooms.map((room) => (
                <li key={room.id}>
                  <label
                    className={cn(
                      'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-2',
                      roomId === room.id
                        ? 'border-pri bg-pri-soft/50'
                        : 'border-border hover:bg-surface-2/60',
                    )}
                  >
                    <input
                      type="radio"
                      name="check-in-room"
                      checked={roomId === room.id}
                      onChange={() => onRoom(room.id)}
                      className="size-4 accent-[var(--pri)]"
                    />
                    <span className="flex min-w-0 grow flex-col">
                      <span className="num font-semibold">{room.number}</span>
                      <span className="truncate text-sm text-text-2">
                        {[
                          STATUS_WORD[room.status],
                          ...room.features,
                          ...room.connectsTo.map((n) => `Connects to ${n}`),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <StatusBadge tone={STATUS_TONE[room.status]}>
                      {STATUS_WORD[room.status]}
                    </StatusBadge>
                  </label>
                </li>
              ))}
            </ul>
            {more > 0 ? (
              <Button variant="ghost" className="w-fit max-lg:h-11" onClick={onShowAll}>
                Show all {rooms.length + more}
              </Button>
            ) : null}
          </fieldset>
        ) : data.bookedTypeFull ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-4">
            <p>
              No {data.stay.roomTypeName} room is free for all of{' '}
              {rangeLabel(data.stay.arrival, data.stay.departure, true)}.
            </p>
            <Button className="w-fit max-lg:h-11" onClick={onUpgrade}>
              <ArrowLeftRight className="size-4" aria-hidden="true" />
              Room move · another room type
            </Button>
          </div>
        ) : null
      ) : null}
    </div>
  )
}

function splitName(row: FrontDeskRow) {
  const [firstName = row.guestName, ...rest] = row.guestName.split(' ')
  return { title: null, firstName, lastName: rest.join(' '), nationality: row.nationality }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function dateOnly(value: string, timeZone = 'Africa/Lagos') {
  const date =
    value.length > 10
      ? new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(value))
      : value
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return `${d} ${MONTHS[m - 1]} ${y}`
}
const clock = (iso: string, timeZone = 'Africa/Lagos') =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(iso),
  )
