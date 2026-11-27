// Cancel reservation and its no-show variant (design #31 DlgCancel, DlgCancelM; the no-show dialog
// has no design of its own): the policy, the penalty and the nights released, the reason (cancel),
// a note, and Waive the penalty. Without penalty.waive the waiver goes to a manager: their PIN here
// cancels and waives together; "Not nearby?" cancels now and sends the waiver to their inbox.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ChangedReservation,
  END_REASON_LABELS,
  END_REASONS,
  type EndReason,
  firstNameOf,
  newId,
  type ReservationDetail,
} from '@vento/shared'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApprovalPrompt } from '@/components/approvals/approval-prompt'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { api, orpc } from '@/lib/api'
import { errorCode, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import {
  endButton,
  endSubtitle,
  NEEDS_CONNECTION,
  noPenaltyLine,
  releasedLine,
  waiverNeedsLine,
} from './change-model'
import {
  AUDIT_LINE,
  FigureBox,
  Pills,
  TextArea,
  useDialogLeaveGuard,
  WaiveField,
} from './change-parts'
import { naira } from './format'

type Mode = 'cancel' | 'no_show'

type Props = {
  detail: ReservationDetail
  mode: Mode
  onClose: () => void
}

const REASONS = END_REASONS.map((value) => ({ value, label: END_REASON_LABELS[value] }))

export function EndDialog({ detail, mode, onClose }: Props) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const cancel = mode === 'cancel'
  const tz = detail.property.timeZone
  const key = useRef(newId())
  const [reason, setReason] = useState<EndReason>()
  const [reasonText, setReasonText] = useState('')
  const [note, setNote] = useState('')
  const [waive, setWaive] = useState(false)
  const [waiveReason, setWaiveReason] = useState('')
  const [problems, setProblems] = useState<
    Partial<Record<'reason' | 'reasonText' | 'waive', string | undefined>>
  >({})
  const [failure, setFailure] = useState<string>()
  const [asking, setAsking] = useState(false)
  const quote = useQuery({
    ...orpc.reservations.endQuote.queryOptions({ input: { reservationId: detail.id, mode } }),
    enabled: online,
    staleTime: 0,
    retry: false,
  })
  const q = quote.data
  const canWaive = Boolean(q?.canWaive)
  // Who could approve a waiver, for "Tunde, Sade or Adaeze can approve it." The list doesn't
  // depend on the reason, so it asks with a fixed one; the prompt below always sends the typed one.
  const approvers = useQuery({
    ...orpc.approvals.approvers.queryOptions({
      input: {
        kind: 'penalty_waiver',
        waiver: {
          target: mode,
          reservationId: detail.id,
          version: q?.version ?? 1,
          actionKey: key.current,
          reason: 'Asking who can approve',
        },
      },
    }),
    enabled: online && waive && Boolean(q?.penalty) && !canWaive,
    staleTime: 60_000,
    retry: false,
  })
  const end = useMutation({
    mutationFn: async (input: { waive?: { reason: string; approvalId?: string } }) => {
      const body = {
        idempotencyKey: key.current,
        reservationId: detail.id,
        version: q?.version ?? 1,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(input.waive ? { waive: input.waive } : {}),
      }
      return cancel
        ? api.reservations.cancel({
            ...body,
            reason: reason ?? 'guest_request',
            ...(reason === 'other' ? { reasonText: reasonText.trim() } : {}),
          })
        : api.reservations.markNoShow(body)
    },
  })
  const leaveBar = useDialogLeaveGuard(onClose)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.reservations.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.approvals.key() }),
    ])

  const done = (result: ChangedReservation, waived: boolean) => {
    const what = cancel ? 'cancelled' : 'marked no-show'
    toast.success(`${result.number} ${what}${waived ? ' · penalty waived' : ''}`)
    void refresh()
    onClose()
  }

  const check = () => {
    const found: typeof problems = {}
    if (cancel && !reason) found.reason = 'Pick a reason for cancelling.'
    if (cancel && reason === 'other' && !reasonText.trim())
      found.reasonText = 'Say why, in a few words'
    if (waive && q?.penalty && !waiveReason.trim())
      found.waive = "Say why you're waiving the penalty."
    setProblems(found)
    return Object.keys(found).length === 0
  }

  const failed = (error: unknown) => {
    setFailure(problemMessage(error))
    const code = errorCode(error)
    if (code === 'RESERVATION_CHANGED' || code === 'NOT_CHANGEABLE') {
      void refresh()
      void quote.refetch()
    }
  }

  const button = endButton(q, { waive, canWaive })
  const submit = async () => {
    if (!online || !q || end.isPending || !check()) return
    setFailure(undefined)
    if (waive && q.penalty && button.asks) {
      setAsking(true)
      return
    }
    try {
      const result = await end.mutateAsync(
        waive && q.penalty ? { waive: { reason: waiveReason.trim() } } : {},
      )
      done(result, Boolean(waive && q.penalty))
    } catch (error) {
      failed(error)
    }
  }

  const title = `${cancel ? 'Cancel reservation' : 'Mark no-show'} · ${detail.number}`
  return (
    <>
      <Dialog
        open={!asking}
        onClose={onClose}
        title={title}
        description={q ? endSubtitle(q, detail.property.businessDate, tz) : 'Checking the policy…'}
        className="max-w-[600px]"
        footer={
          leaveBar ?? (
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
                {!online ? (
                  <span className="mr-auto text-sm text-am">{NEEDS_CONNECTION}</span>
                ) : null}
                <Button variant="ghost" onClick={onClose}>
                  {cancel ? 'Keep booking' : 'Not now'}
                </Button>
                <Button
                  variant="primary"
                  disabled={!online || !q?.allowed}
                  loading={end.isPending}
                  onClick={() => void submit()}
                >
                  {button.label}
                </Button>
              </div>
              <span className="text-sm text-text-3">{AUDIT_LINE}</span>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-4">
          {quote.isPending && online ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="Checking the policy"
              className="flex flex-col gap-2"
            >
              <span className="h-24 animate-pulse rounded-sm bg-surface-2" />
              <span className="h-11 animate-pulse rounded-sm bg-surface-2" />
            </div>
          ) : quote.isError ? (
            <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
              {problemMessage(quote.error)}
            </p>
          ) : q ? (
            <>
              {q.blocked ? (
                <p role="alert" className="rounded-sm bg-am-bg px-3 py-2 text-am">
                  {q.blocked}
                </p>
              ) : null}
              {!cancel ? (
                <p className="text-sm text-text-2">
                  Mark a no-show only when the guest won't arrive tonight.
                </p>
              ) : null}
              <FigureBox
                rows={[
                  { label: 'Policy', value: q.policy },
                  q.penalty
                    ? {
                        label: 'Penalty',
                        value: `${q.penalty.basisLabel} · ${naira(q.penalty.amount)}`,
                      }
                    : { label: 'Penalty', value: noPenaltyLine(q, tz) ?? 'No penalty' },
                  { label: 'Rooms', value: releasedLine(q.released) },
                  {
                    label: q.penalty
                      ? waive
                        ? 'Penalty to waive'
                        : 'Penalty to charge'
                      : 'To charge',
                    value: q.penalty ? naira(q.penalty.amount) : naira('0'),
                    strong: true,
                  },
                ]}
              >
                {q.fx && q.penalty ? (
                  <p className="text-right text-sm text-text-3">≈ {q.fx.text}</p>
                ) : null}
              </FigureBox>
              {failure ? (
                <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
                  {failure}
                </p>
              ) : null}
              {cancel ? (
                <Pills
                  legend="Reason (required)"
                  name="end-reason"
                  options={REASONS}
                  value={reason}
                  onChange={(value) => {
                    setReason(value)
                    setProblems((p) => ({ ...p, reason: undefined }))
                  }}
                  error={problems.reason}
                />
              ) : null}
              {cancel && reason === 'other' ? (
                <Field
                  label="Why"
                  value={reasonText}
                  maxLength={200}
                  error={problems.reasonText}
                  onChange={(event) => setReasonText(event.target.value)}
                  className="max-lg:h-11"
                />
              ) : null}
              <TextArea id="end-note" label="Note (optional)" value={note} onChange={setNote} />
              {q.penalty ? (
                <WaiveField
                  checked={waive}
                  onChecked={setWaive}
                  reason={waiveReason}
                  onReason={(value) => {
                    setWaiveReason(value)
                    if (value.trim()) setProblems((p) => ({ ...p, waive: undefined }))
                  }}
                  error={problems.waive}
                  note={
                    canWaive
                      ? null
                      : waiverNeedsLine(approvers.data?.approvers.map((a) => a.name) ?? [])
                  }
                />
              ) : null}
            </>
          ) : null}
        </div>
      </Dialog>
      {asking && q ? (
        <ApprovalPrompt
          action={{
            kind: 'penalty_waiver',
            waiver: {
              target: mode,
              reservationId: detail.id,
              version: q.version,
              actionKey: key.current,
              reason: waiveReason.trim(),
            },
          }}
          timeZone={tz}
          approveLabel={`Approve waiver and ${cancel ? 'cancel' : 'mark no-show'}`}
          inboxLabel={(name) =>
            `${cancel ? 'Cancel' : 'Mark no-show'} now and send the waiver to ${name}'s inbox`
          }
          beforeSend={async () => {
            // The rooms are released now; the waiver goes to the penalty this records.
            const result = await end.mutateAsync({})
            const penaltyId = result.penalties[0]?.id
            if (!penaltyId) throw new Error('There is no penalty to waive.')
            return {
              kind: 'penalty_waiver',
              waiver: { target: 'penalty', penaltyId, reason: waiveReason.trim() },
            }
          }}
          onApproved={async (approval) => {
            try {
              const result = await end.mutateAsync({
                waive: { reason: waiveReason.trim(), approvalId: approval.id },
              })
              done(result, true)
            } catch (error) {
              setAsking(false)
              failed(error)
            }
          }}
          onSent={(approval) => {
            toast.success(
              `${detail.number} ${cancel ? 'cancelled' : 'marked no-show'} · waiver sent to ${firstNameOf(approval.approver?.name ?? 'the manager')}`,
            )
            void refresh()
            onClose()
          }}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  )
}
