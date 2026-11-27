// The approval prompt (design #22: ApprovalPOS for the layout, the desk panel of ReservationDetail;
// spec "Approve here, by PIN" and "Ask in the inbox"): what is asked and the figures on the left,
// the approving manager, then the PIN pad on the right when this is a registered hotel device. A
// dialog on desktop, a bottom sheet on phones. The requester stays signed in throughout.
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  type ApprovalActionInput,
  type ApprovalView,
  type Approver,
  firstNameOf,
  newId,
  PIN_LENGTH,
} from '@vento/shared'
import { Send, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { LoadError } from '@/components/settings/load-states'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { PinPad } from '@/components/ui/pin-pad'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, problemMessage } from '@/lib/errors'
import { initials } from '@/lib/team'
import { useOnline } from '@/offline/connection'
import {
  NEEDS_CONNECTION,
  nobodyLine,
  promptMeta,
  promptTitle,
  reasonLine,
  subjectFigures,
  withoutPinLine,
} from './format'

type Props = {
  action: ApprovalActionInput
  timeZone: string
  // The approver's yes, here: the sheet books with it at once.
  onApproved: (approval: ApprovalView) => void
  // Sent to the approver's inbox: the sheet waits for the answer.
  onSent: (approval: ApprovalView) => void
  onClose: () => void
}

export function ApprovalPrompt({ action, timeZone, onApproved, onSent, onClose }: Props) {
  const online = useOnline()
  const askedAt = useRef(new Date())
  // One key per request: a double tap or a retry after a dropped connection returns the same one.
  const requestKey = useRef(newId())
  const hereKey = useRef(newId())
  const approvers = useQuery({
    ...orpc.approvals.approvers.queryOptions({ input: action }),
    enabled: online,
    retry: false,
    staleTime: 0,
  })
  const data = approvers.data
  const [picked, setPicked] = useState<Approver>()
  const only = data?.approvers.length === 1 ? data.approvers[0] : undefined
  // Nobody is pre-selected unless there is only one, so a PIN is never typed under another name.
  const approver = picked ?? only
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(0)
  const [problem, setProblem] = useState<{ message: string; locked?: boolean }>()
  const approveHere = useMutation(orpc.approvals.approveHere.mutationOptions())
  const request = useMutation(orpc.approvals.request.mutationOptions())

  const pick = (next: Approver) => {
    setPicked(next)
    setPin('')
    setProblem(undefined)
  }

  const submitPin = async () => {
    if (!approver || pin.length !== PIN_LENGTH || approveHere.isPending || !online) return
    setProblem(undefined)
    try {
      const approval = await approveHere.mutateAsync({
        ...action,
        idempotencyKey: hereKey.current,
        approverMemberId: approver.memberId,
        pin,
      })
      hereKey.current = newId()
      onApproved(approval)
    } catch (error) {
      const code = errorCode(error)
      setPin('')
      setShake((n) => n + 1)
      setProblem({
        message: problemMessage(error),
        locked: code === 'PIN_LOCKED' || code === 'PIN_NEEDS_RESET',
      })
    }
  }

  const send = async () => {
    if (!approver || request.isPending || !online) return
    setProblem(undefined)
    try {
      const approval = await request.mutateAsync({
        ...action,
        idempotencyKey: requestKey.current,
        approverMemberId: approver.memberId,
      })
      requestKey.current = newId()
      onSent(approval)
    } catch (error) {
      setProblem({ message: problemMessage(error) })
    }
  }

  const subject = data?.subject
  const first = subject ? firstNameOf(subject.requesterName) : ''
  const inboxLabel = approver ? `Send to ${firstNameOf(approver.name)}'s inbox` : 'Send to an inbox'

  return (
    <Dialog
      open
      onClose={onClose}
      title="Needs a manager"
      description={subject ? promptTitle(subject) : 'Checking who can approve…'}
      className="max-w-[860px]"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-3">
            {first
              ? `Logged with both names, the reason and this device. ${first} stays signed in.`
              : ''}
          </span>
          <Button className="max-lg:h-11" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      {!online ? (
        <p role="status" className="rounded-sm bg-am-bg px-3 py-2 text-sm text-am">
          {NEEDS_CONNECTION}
        </p>
      ) : approvers.isPending ? (
        <div
          role="status"
          className="flex flex-col gap-3"
          aria-busy="true"
          aria-label="Checking who can approve"
        >
          <span className="h-24 animate-pulse rounded-sm bg-surface-2" />
          <span className="h-11 animate-pulse rounded-sm bg-surface-2" />
        </div>
      ) : approvers.isError || !data || !subject ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-ro">
            {problemMessage(approvers.error)}
          </p>
          <LoadError onRetry={() => approvers.refetch()} retrying={approvers.isFetching} />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-4">
            <p className="num text-sm text-text-2">
              {promptMeta(subject, askedAt.current, timeZone)}
            </p>
            <dl className="num flex flex-col gap-1.5 rounded-sm bg-surface-2 p-3.5 ring-1 ring-border">
              {subjectFigures(subject).map((figure) => (
                <div
                  key={figure.label}
                  className={cn(
                    'flex flex-wrap justify-between gap-x-3',
                    figure.strong && 'border-t border-border pt-1.5 font-semibold',
                  )}
                >
                  <dt className={figure.strong ? undefined : 'text-text-2'}>{figure.label}</dt>
                  <dd>{figure.value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-2">Reason from {first}</span>
              <p className="break-words rounded-sm border border-input bg-surface px-3 py-2.5">
                {reasonLine(subject)}
              </p>
            </div>
            {data.approvers.length === 0 ? (
              <div
                role="alert"
                className="flex flex-col gap-1 rounded-sm bg-am-bg px-3 py-2 text-am"
              >
                <span>{nobodyLine(subject)}</span>
                {withoutPinLine(data.withoutPin) ? (
                  <span className="text-sm">{withoutPinLine(data.withoutPin)}</span>
                ) : null}
              </div>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-sm font-medium text-text-2">
                  Approving manager
                </legend>
                <div className="flex flex-wrap gap-2">
                  {data.approvers.map((person) => {
                    const on = approver?.memberId === person.memberId
                    return (
                      <label
                        key={person.memberId}
                        className={cn(
                          'inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                          on
                            ? 'border-pri bg-pri-soft font-medium text-pri-ink'
                            : 'border-border bg-surface hover:bg-surface-2',
                        )}
                      >
                        <input
                          type="radio"
                          name="approver"
                          className="sr-only"
                          checked={on}
                          onChange={() => pick(person)}
                        />
                        <span
                          aria-hidden="true"
                          className="grid size-8 flex-none place-items-center rounded-full bg-surface-3 text-xs font-semibold text-text-2"
                        >
                          {initials(person.name)}
                        </span>
                        <span className="truncate">
                          {person.name} · {person.role}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {withoutPinLine(data.withoutPin) ? (
                  <span className="text-sm text-text-3">{withoutPinLine(data.withoutPin)}</span>
                ) : null}
              </fieldset>
            )}
            {data.canApproveHere && data.approvers.length > 0 ? (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-2">
                Not nearby?
                <button
                  type="button"
                  disabled={!approver || request.isPending}
                  onClick={() => void send()}
                  className="inline-flex min-h-11 items-center font-medium text-pri-ink hover:underline disabled:text-text-3 disabled:no-underline lg:min-h-0"
                >
                  {inboxLabel}
                </button>
              </p>
            ) : null}
          </div>

          <div className="flex flex-col items-center gap-3 rounded-sm border border-border bg-surface-2 p-4">
            {data.approvers.length === 0 ? (
              <p className="text-center text-sm text-text-2">
                Change the discount on Room &amp; rate, or ask the owner to raise a limit.
              </p>
            ) : data.canApproveHere ? (
              <>
                <span className="text-center font-semibold">
                  {approver ? `${firstNameOf(approver.name)}, enter your PIN` : 'Pick who to ask'}
                </span>
                <PinPad
                  size="md"
                  length={pin.length}
                  shake={shake}
                  error={Boolean(problem)}
                  disabled={!approver || approveHere.isPending || Boolean(problem?.locked)}
                  onDigit={(digit) => {
                    setProblem(undefined)
                    setPin((value) => (value.length < PIN_LENGTH ? value + digit : value))
                  }}
                  onErase={() => setPin((value) => value.slice(0, -1))}
                  onEnter={() => void submitPin()}
                />
                <p role="alert" className="min-h-5 text-center text-sm text-ro">
                  {problem?.message ?? ''}
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={!approver || pin.length !== PIN_LENGTH || Boolean(problem?.locked)}
                  loading={approveHere.isPending}
                  onClick={() => void submitPin()}
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Approve {subject.percent}% and book
                </Button>
              </>
            ) : (
              <>
                <p className="text-center text-sm text-text-2">
                  Approvers enter their PIN on a shared hotel device. From here, send the request to
                  their inbox.
                </p>
                <p role="alert" className="min-h-5 text-center text-sm text-ro">
                  {problem?.message ?? ''}
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={!approver}
                  loading={request.isPending}
                  onClick={() => void send()}
                >
                  <Send className="size-4" aria-hidden="true" />
                  {approver ? inboxLabel : 'Pick who to ask'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
