// One request in the inbox (design: Inbox view approvals, detail pane; ApprovalPhone on phones): who
// asked, when, the booking, their limit, the rate and totals, and the reason. The addressed
// approver declines with a comment or approves with their PIN (a small PIN dialog on desktop, the
// pad inline on phones). The requester can cancel a waiting request or continue the booking.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ApprovalDetail, clockAt, firstNameOf, PIN_LENGTH, roleLabel } from '@vento/shared'
import { ShieldCheck } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { PinPad } from '@/components/ui/pin-pad'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { errorCode, problemMessage } from '@/lib/errors'
import { useMediaQuery } from '@/lib/media'
import { useOnline } from '@/offline/connection'
import { nightsLabel, stayRange } from '../reservations/format'
import {
  age,
  answerLine,
  NEEDS_CONNECTION,
  naira,
  reasonLine,
  rowAmount,
  rowLabel,
  rowTitle,
  statusBadge,
} from './format'

export function ApprovalDetailCard({ view }: { view: ApprovalDetail }) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const phone = useMediaQuery('(max-width: 1023px)')
  const [comment, setComment] = useState('')
  const [commentProblem, setCommentProblem] = useState<string>()
  const [pinOpen, setPinOpen] = useState(false)
  const decline = useMutation(orpc.approvals.decline.mutationOptions())
  const cancel = useMutation(orpc.approvals.cancel.mutationOptions())
  const s = view.subject
  const tz = view.timeZone
  const badge = statusBadge(view)
  const requesterFirst = firstNameOf(view.requester.name)
  const answerable = view.role === 'approver' && view.status === 'pending' && !view.hotelArchived
  const resumable =
    view.role === 'requester' &&
    (view.status === 'pending' || (view.status === 'approved' && !view.usedAt)) &&
    !view.hotelArchived

  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.approvals.key() })

  const onDecline = async () => {
    if (!comment.trim()) {
      setCommentProblem(`Add a comment so ${requesterFirst} knows why.`)
      document.getElementById(`comment-${view.id}`)?.focus()
      return
    }
    try {
      await decline.mutateAsync({ id: view.id, comment: comment.trim() })
      toast.success(`Declined ${s.percent}% for ${s.guestName}`)
      void refresh()
    } catch (error) {
      toast.error(problemMessage(error))
      void refresh()
    }
  }

  return (
    <article
      aria-labelledby={`title-${view.id}`}
      className="flex min-w-0 flex-col rounded-lg border border-border bg-surface shadow-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase">
            {rowLabel(view)}
          </span>
          <h2 id={`title-${view.id}`} className="text-lg font-semibold break-words">
            {rowTitle(view)}
          </h2>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="num text-lg font-semibold">{rowAmount(view)}</span>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </div>
      </header>
      <div className="flex flex-col gap-4 px-5 py-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Item label="Asked by">
            {view.requester.name}
            {s.deviceName ? ` · ${s.deviceName}` : ''}
          </Item>
          <Item label="When">
            <span className="num">
              {new Intl.DateTimeFormat('en-GB', {
                day: 'numeric',
                month: 'short',
                timeZone: tz,
              }).format(new Date(view.requestedAt))}{' '}
              {clockAt(view.requestedAt, tz)} ·{' '}
              {age(view.requestedAt) === 'just now' ? 'just now' : `${age(view.requestedAt)} ago`}
            </span>
          </Item>
          <Item label="Booking">
            {s.roomTypeName} · {s.planName} · {stayRange(s.arrival, s.departure)} ·{' '}
            {nightsLabel(s.nights)}
          </Item>
          <Item label="Limit">
            {s.requesterLimit}% · {s.requesterRole || roleLabel('front_desk').toLowerCase()}
          </Item>
          <Item label="Rate">
            <span className="num">
              {naira(s.planPrice)} → {naira(s.newPrice)} {s.varies ? 'first night' : 'a night'}
            </span>
          </Item>
          <Item label="Stay total incl. taxes">
            <span className="num">
              {naira(s.totalBefore)} → {naira(s.totalAfter)}
            </span>
          </Item>
        </dl>
        <blockquote className="rounded-sm border-l-2 border-am-dot bg-surface-2 px-3 py-2 break-words">
          “{reasonLine(s)}”
        </blockquote>

        {answerable ? (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-2">
                Comment <span className="text-text-3">(required to decline)</span>
              </span>
              <textarea
                id={`comment-${view.id}`}
                value={comment}
                maxLength={500}
                rows={2}
                aria-invalid={commentProblem ? true : undefined}
                aria-describedby={commentProblem ? `comment-problem-${view.id}` : undefined}
                onChange={(event) => {
                  setComment(event.target.value)
                  if (event.target.value.trim()) setCommentProblem(undefined)
                }}
                className="rounded-sm border border-input bg-surface px-3 py-2 text-[16px] focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:text-base"
              />
              {commentProblem ? (
                <span id={`comment-problem-${view.id}`} role="alert" className="text-sm text-ro">
                  {commentProblem}
                </span>
              ) : null}
            </label>
            {!online ? (
              <p role="status" className="text-sm text-am">
                {NEEDS_CONNECTION}
              </p>
            ) : null}
            {phone ? <PinApprove view={view} comment={comment} onDone={refresh} inline /> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                className="max-lg:h-11"
                disabled={!online}
                loading={decline.isPending}
                onClick={() => void onDecline()}
              >
                Decline
              </Button>
              {phone ? null : (
                <Button variant="primary" disabled={!online} onClick={() => setPinOpen(true)}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Approve with PIN
                </Button>
              )}
            </div>
            <p className="text-sm text-text-3">
              {requesterFirst} sees your answer on screen within seconds. Both names are kept in the
              audit trail.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {view.status === 'expired' && view.role === 'approver' ? (
              <p className="num text-text-2">
                This request expired at {clockAt(view.expiresAt, tz)}.
              </p>
            ) : view.status === 'cancelled' && view.role === 'approver' ? (
              <p className="text-text-2">
                {requesterFirst} cancelled this request
                {view.comment ? ` (${view.comment.toLowerCase()})` : ''}.
              </p>
            ) : (
              <p className="num text-text-2">{answerLine(view, tz)}</p>
            )}
            {view.hotelArchived && view.status === 'pending' ? (
              <p className="text-sm text-text-3">This hotel was archived.</p>
            ) : null}
            {view.role === 'requester' ? (
              <div className="flex flex-wrap gap-2">
                {view.status === 'pending' ? (
                  <Button
                    className="max-lg:h-11"
                    disabled={!online}
                    loading={cancel.isPending}
                    onClick={() =>
                      cancel.mutate(
                        { id: view.id, reason: 'by_requester' },
                        {
                          onSuccess: () => {
                            toast.info('Request cancelled')
                            void refresh()
                          },
                          onError: (error) => toast.error(problemMessage(error)),
                        },
                      )
                    }
                  >
                    Cancel request
                  </Button>
                ) : null}
                {resumable ? (
                  <Link
                    to="/reservations"
                    search={{ sheet: 'new', approval: view.id, hotel: view.propertyId }}
                    className="inline-flex h-9 items-center rounded-sm bg-pri px-3.5 font-medium text-white hover:bg-pri-hover max-lg:h-11"
                  >
                    Continue booking
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {pinOpen ? (
        <Dialog
          open
          onClose={() => setPinOpen(false)}
          title={`Approve ${s.percent}% for ${s.guestName}`}
          description="Enter your PIN to approve. Typing digits works too."
          className="max-w-[360px]"
        >
          <PinApprove
            view={view}
            comment={comment}
            onDone={() => {
              setPinOpen(false)
              void refresh()
            }}
          />
        </Dialog>
      ) : null}
    </article>
  )
}

// The approver's PIN, then Approve discount. Wrong tries count with the lock screen's.
function PinApprove({
  view,
  comment,
  onDone,
  inline,
}: {
  view: ApprovalDetail
  comment: string
  onDone: () => void
  inline?: boolean
}) {
  const online = useOnline()
  const approve = useMutation(orpc.approvals.approve.mutationOptions())
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(0)
  const [problem, setProblem] = useState<{ message: string; locked?: boolean }>()
  const submit = async () => {
    if (pin.length !== PIN_LENGTH || approve.isPending || !online) return
    try {
      await approve.mutateAsync({
        id: view.id,
        pin,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      })
      toast.success(`Approved ${view.subject.percent}% for ${view.subject.guestName}`)
      onDone()
    } catch (error) {
      const code = errorCode(error)
      setPin('')
      setShake((n) => n + 1)
      setProblem({
        message: problemMessage(error),
        locked: code === 'PIN_LOCKED' || code === 'PIN_NEEDS_RESET',
      })
      if (code === 'APPROVAL_NOT_PENDING') onDone()
    }
  }
  return (
    <div className="flex flex-col items-center gap-3 pt-1">
      {inline ? (
        <span className="text-sm font-medium">
          {firstNameOf(view.approver?.name ?? 'You')}, enter your PIN to approve
        </span>
      ) : null}
      <PinPad
        size="md"
        length={pin.length}
        shake={shake}
        error={Boolean(problem)}
        disabled={!online || approve.isPending || Boolean(problem?.locked)}
        keyboard={!inline}
        onDigit={(digit) => {
          setProblem(undefined)
          setPin((value) => (value.length < PIN_LENGTH ? value + digit : value))
        }}
        onErase={() => setPin((value) => value.slice(0, -1))}
        onEnter={() => void submit()}
      />
      <p role="alert" className="min-h-5 text-center text-sm text-ro">
        {problem?.message ?? ''}
      </p>
      <Button
        variant="primary"
        size="lg"
        className="w-full max-w-[236px]"
        disabled={!online || pin.length !== PIN_LENGTH || Boolean(problem?.locked)}
        loading={approve.isPending}
        onClick={() => void submit()}
      >
        Approve discount
      </Button>
    </div>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] leading-4 font-semibold tracking-[0.05em] text-text-3 uppercase">
        {label}
      </dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
