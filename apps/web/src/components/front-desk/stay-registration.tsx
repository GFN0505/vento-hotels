// The registration on a reservation (spec: "ID numbers and ID images", "Reverse check-in"): who was
// registered, with numbers masked. Reveal (a full number for 30 seconds) and View ID photo (a
// 60-second link) are for GMs and owners, with a reason, online only, and recorded with their name.
// Print registration card (a reprint after the first) and Add ID photo for a stay checked in
// without one. Reverse check-in is a GM's, the same business date, never their own.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ID_TYPE_LABELS,
  newId,
  REVEAL_SECONDS,
  REVERSE_REASON_LABELS,
  REVERSE_REASONS,
  type RegistrationView,
  type ReverseReason,
  VISA_TYPE_LABELS,
} from '@vento/shared'
import { demonymOf } from '@vento/shared/countries'
import { Eye, FileText, IdCard, Printer, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Pills, TextArea } from '@/components/reservations/change-parts'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { IdPhoto, type IdPhotoChoice } from './id-photo'
import { printPdf } from './print-card'

export function StayRegistration({
  stayId,
  propertyId,
  photoMissing,
}: {
  stayId: string
  propertyId: string
  photoMissing: boolean
}) {
  const online = useOnline()
  const query = useQuery(orpc.registrations.get.queryOptions({ input: { stayId } }))
  const [reveal, setReveal] = useState<{
    registration: RegistrationView
    which: 'id' | 'visa'
  } | null>(null)
  const [viewing, setViewing] = useState<RegistrationView | null>(null)
  const [adding, setAdding] = useState<RegistrationView | null>(null)
  const [printing, setPrinting] = useState(false)
  const data = query.data
  if (!data || data.registrations.length === 0) return null
  const lead = data.registrations.find((r) => r.lead)
  const print = async () => {
    setPrinting(true)
    try {
      const card = await api.documents.registrationCard({ stayId })
      printPdf(card.url)
      if (card.copy > 1) toast.success(`Reprint · copy ${card.copy}`)
    } catch (error) {
      toast.error(problemMessage(error))
    } finally {
      setPrinting(false)
    }
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <IdCard className="size-4 text-text-3" aria-hidden="true" />
          Registration
          {lead?.cardNumber ? (
            <span className="num text-sm font-normal text-text-3">{lead.cardNumber}</span>
          ) : null}
        </h2>
        {data.can.print ? (
          <span className="flex flex-col items-end gap-1">
            <Button
              className="max-lg:h-11"
              loading={printing}
              disabled={!online}
              aria-describedby={online ? undefined : 'print-card-why'}
              onClick={() => void print()}
            >
              <Printer className="size-4" aria-hidden="true" />
              Print registration card
            </Button>
            {online ? null : (
              <span id="print-card-why" className="text-xs text-text-3">
                Print available when you're back online.
              </span>
            )}
          </span>
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {data.registrations.map((registration) => (
          <li key={registration.id} className="flex flex-col gap-2 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {registration.firstName} {registration.lastName}
              </span>
              <span className="text-sm text-text-2">{demonymOf(registration.nationality)}</span>
              {registration.lead ? null : (
                <span className="text-sm text-text-3">· another guest</span>
              )}
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {registration.idType && registration.idNumberMasked ? (
                <NumberLine
                  label={ID_TYPE_LABELS[registration.idType]}
                  masked={registration.idNumberMasked}
                  canReveal={data.can.viewId && online}
                  onReveal={() => setReveal({ registration, which: 'id' })}
                />
              ) : null}
              {registration.visaType ? (
                <NumberLine
                  label={VISA_TYPE_LABELS[registration.visaType]}
                  masked={registration.visaNumberMasked ?? ''}
                  canReveal={data.can.viewId && online && Boolean(registration.visaNumberMasked)}
                  onReveal={() => setReveal({ registration, which: 'visa' })}
                />
              ) : null}
              {registration.nextDestination ? (
                <div className="flex gap-2">
                  <dt className="text-text-3">Next destination</dt>
                  <dd>{registration.nextDestination}</dd>
                </div>
              ) : null}
            </dl>
            {registration.lead ? (
              registration.idDocument ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-text-2">
                  ID photo on file
                  {data.can.viewId ? (
                    <Button
                      size="sm"
                      className="max-lg:h-11"
                      disabled={!online}
                      onClick={() => setViewing(registration)}
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      View ID photo
                    </Button>
                  ) : null}
                </div>
              ) : photoMissing && data.can.addPhoto ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-ro">
                  ID photo to add
                  <Button
                    size="sm"
                    className="max-lg:h-11"
                    disabled={!online}
                    onClick={() => setAdding(registration)}
                  >
                    Add ID photo
                  </Button>
                </div>
              ) : null
            ) : null}
          </li>
        ))}
      </ul>
      {reveal ? (
        <RevealDialog
          registration={reveal.registration}
          which={reveal.which}
          onClose={() => setReveal(null)}
        />
      ) : null}
      {viewing ? <ViewPhotoDialog registration={viewing} onClose={() => setViewing(null)} /> : null}
      {adding ? (
        <AddPhotoDialog
          registration={adding}
          propertyId={propertyId}
          onClose={() => setAdding(null)}
        />
      ) : null}
    </Card>
  )
}

function NumberLine({
  label,
  masked,
  canReveal,
  onReveal,
}: {
  label: string
  masked: string
  canReveal: boolean
  onReveal: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <dt className="text-text-3">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className="num">{masked || '–'}</span>
        {canReveal ? (
          <button
            type="button"
            className="text-sm font-medium text-pri-ink hover:underline"
            onClick={onReveal}
          >
            Reveal
          </button>
        ) : null}
      </dd>
    </div>
  )
}

function RevealDialog({
  registration,
  which,
  onClose,
}: {
  registration: RegistrationView
  which: 'id' | 'visa'
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [shown, setShown] = useState<string>()
  const [left, setLeft] = useState(REVEAL_SECONDS)
  const [failure, setFailure] = useState<string>()
  const [busy, setBusy] = useState(false)
  const what =
    which === 'visa'
      ? 'visa number'
      : registration.idType === 'passport'
        ? 'passport number'
        : `${registration.idType ? ID_TYPE_LABELS[registration.idType] : 'ID'} number`
  useEffect(() => {
    if (!shown) return
    const timer = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(timer)
  }, [shown])
  useEffect(() => {
    if (shown && left <= 0) {
      setShown(undefined)
      onClose()
    }
  }, [shown, left, onClose])
  const submit = async () => {
    if (reason.trim().length < 3) return setFailure('Say why, in a few words.')
    setBusy(true)
    setFailure(undefined)
    try {
      const result = await api.registrations.reveal({
        registrationId: registration.id,
        which,
        reason: reason.trim(),
      })
      setShown(result.number)
      setLeft(result.seconds)
    } catch (error) {
      setFailure(problemMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reveal ${what}?`}
      description="Shown for 30 seconds and recorded with your name."
      footer={
        shown ? (
          <Button onClick={onClose}>Hide</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              Reveal
            </Button>
          </>
        )
      }
    >
      {shown ? (
        <div className="flex flex-col items-center gap-2 py-2" role="status">
          <span className="num text-2xl font-semibold tracking-wider">{shown}</span>
          <span className="text-sm text-text-3">Hidden again in {left} s</span>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="flex flex-col gap-2"
        >
          <Field
            label="Reason"
            value={reason}
            hint="e.g. Immigration officer at the desk"
            error={failure}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
        </form>
      )}
    </Dialog>
  )
}

function ViewPhotoDialog({
  registration,
  onClose,
}: {
  registration: RegistrationView
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [link, setLink] = useState<{ url: string; contentType: string }>()
  const [failure, setFailure] = useState<string>()
  const [busy, setBusy] = useState(false)
  // The link works for 60 seconds; the dialog closes with it.
  useEffect(() => {
    if (!link) return
    const timer = setTimeout(onClose, 60_000)
    return () => clearTimeout(timer)
  }, [link, onClose])
  const submit = async () => {
    if (reason.trim().length < 3) return setFailure('Say why, in a few words.')
    setBusy(true)
    try {
      setLink(
        await api.registrations.viewIdDocument({
          registrationId: registration.id,
          reason: reason.trim(),
        }),
      )
    } catch (error) {
      setFailure(problemMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`ID photo · ${registration.firstName} ${registration.lastName}`}
      description="Opened for 60 seconds and recorded with your name."
      className="max-w-[720px]"
      footer={
        link ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              View ID photo
            </Button>
          </>
        )
      }
    >
      {link ? (
        link.contentType === 'application/pdf' ? (
          // Never framed in the app: the scan opens in its own tab, from storage, as a PDF only.
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-strong bg-surface px-3 font-medium hover:bg-surface-2"
          >
            <FileText className="size-4" aria-hidden="true" />
            Open the ID scan (PDF)
          </a>
        ) : (
          <img
            src={link.url}
            alt={`ID of ${registration.firstName} ${registration.lastName}`}
            className="max-h-[60vh] w-full rounded-md border border-border object-contain"
          />
        )
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field
            label="Reason"
            value={reason}
            hint="e.g. Checking the guest's identity with the police"
            error={failure}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
        </form>
      )}
    </Dialog>
  )
}

function AddPhotoDialog({
  registration,
  propertyId,
  onClose,
}: {
  registration: RegistrationView
  propertyId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [photo, setPhoto] = useState<IdPhotoChoice>({ kind: 'none' })
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const documentId = useRef(newId())
  const save = async () => {
    if (photo.kind !== 'file') return setFailure('Take a photo of the ID, or upload a scan.')
    setBusy(true)
    try {
      await api.registrations.uploadIdDocument({
        documentId: documentId.current,
        propertyId,
        contentType: photo.file.contentType,
        source: 'camera',
        data: photo.file.base64,
      })
      await api.registrations.attachIdDocument({
        registrationId: registration.id,
        documentId: documentId.current,
      })
      void queryClient.invalidateQueries({ queryKey: orpc.registrations.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.reservations.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.frontDesk.key() })
      toast.success('ID photo added')
      onClose()
    } catch (error) {
      setFailure(problemMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add ID photo · ${registration.firstName} ${registration.lastName}`}
      className="max-w-[640px]"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Add ID photo
          </Button>
        </>
      }
    >
      <IdPhoto
        idPrefix="add-id"
        value={photo}
        onChange={setPhoto}
        required
        canSkip={false}
        error={failure}
      />
    </Dialog>
  )
}

export function ReverseDialog({
  stayId,
  version,
  guestName,
  roomNumber,
  onClose,
}: {
  stayId: string
  version: number
  guestName: string
  roomNumber: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState<ReverseReason>()
  const [text, setText] = useState('')
  const [failure, setFailure] = useState<string>()
  const [busy, setBusy] = useState(false)
  const key = useRef(newId())
  const submit = async () => {
    if (!reason) return setFailure('Pick why.')
    if (reason === 'other' && !text.trim()) return setFailure('Say why, in a few words.')
    setBusy(true)
    try {
      await api.checkIn.reverse({
        idempotencyKey: key.current,
        stayId,
        version,
        reason,
        ...(reason === 'other' ? { reasonText: text.trim() } : {}),
      })
      void queryClient.invalidateQueries({ queryKey: orpc.reservations.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.frontDesk.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.tapeChart.key() })
      toast.success('Check-in reversed')
      onClose()
    } catch (error) {
      key.current = newId()
      setFailure(problemMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reverse check-in for ${guestName}?`}
      description={`Room ${roomNumber} goes back to not checked in, and the room is set dirty. Recorded with your name. The owner sees this in tomorrow's report.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={() => void submit()}>
            <ShieldAlert className="size-4" aria-hidden="true" />
            Reverse check-in
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Pills
          legend="Reason (required)"
          name="reverse-reason"
          options={REVERSE_REASONS.map((value) => ({ value, label: REVERSE_REASON_LABELS[value] }))}
          value={reason}
          onChange={setReason}
          error={failure}
        />
        {reason === 'other' ? (
          <TextArea
            id="reverse-text"
            label="Say why"
            value={text}
            onChange={setText}
            maxLength={200}
          />
        ) : null}
      </div>
    </Dialog>
  )
}
