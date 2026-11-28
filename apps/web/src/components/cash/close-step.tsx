// Step 2 of 2, close (design #34 ShiftClose, submitted): the count is in and locked; expected and
// the difference per line are shown for the first time. The Close shift panel: Balanced, Short or
// Over; within the limit a reason is enough, above it a manager approves (PIN here or the inbox);
// the float kept stays in the drawer (naira only) and the rest goes to the safe with a bag number.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type ApprovalView,
  CLOSE_SUGGESTIONS,
  type CountedShift,
  clockAt,
  dec,
  newId,
  type ShiftView,
} from '@vento/shared'
import { type FormEvent, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { ApprovalLine, CashApprovalPrompt, useCashApproval } from './approval-flow'
import { amountOf, amountProblem } from './count-model'
import {
  closeBadge,
  closeLabel,
  dateLabel,
  differenceLine,
  foreignShort,
  limitLine,
  naira,
  overLimit,
  toSafe,
} from './format'
import { NoteCount } from './note-count'
import { focusFirstProblem } from './open-form'
import { ReasonField } from './reason-field'
import { TakingsTable } from './takings-table'

export const CLOSE_NEEDS_CONNECTION = 'Closing a shift needs a connection.'

export function CloseStep({
  shift,
  onClosed,
}: {
  shift: CountedShift
  onClosed: (shift: ShiftView) => void
}) {
  const online = useOnline()
  const client = useQueryClient()
  const formId = useId()
  const tz = shift.timeZone
  const [reason, setReason] = useState('')
  const [floatKept, setFloatKept] = useState(() =>
    dec(shift.openingFloat).greaterThan(shift.cashCounted) ? shift.cashCounted : shift.openingFloat,
  )
  const [bag, setBag] = useState('')
  const [problems, setProblems] = useState<
    Partial<Record<'reason' | 'floatKept' | 'bagNumber' | 'form', string>>
  >({})
  const key = useRef(newId())
  const approval = useCashApproval(reason)

  const total = shift.totalDifference
  const differs = !dec(total).isZero()
  const needsApproval = overLimit(total, shift.limit)
  const badge = closeBadge(shift.lines)
  const kept = amountProblem(floatKept) ? '0.00' : amountOf(floatKept)
  const dropNgn = dec(kept).greaterThan(shift.cashCounted)
    ? '0.00'
    : toSafe(shift.cashCounted, kept)
  const foreign = shift.lines.filter(
    (l) => l.kind === 'cash' && l.currency !== 'NGN' && dec(l.counted).greaterThan(0),
  )
  const anythingToSafe = dec(dropNgn).greaterThan(0) || foreign.length > 0

  const action = useMemo(
    () => ({
      kind: 'cash_variance' as const,
      variance: { stage: 'close' as const, shiftId: shift.id, reason: reason.trim() },
    }),
    [shift.id, reason],
  )

  const close = useMutation({
    mutationFn: (approvalId?: string) =>
      api.cash.close({
        idempotencyKey: key.current,
        shiftId: shift.id,
        version: shift.version,
        floatKept: kept,
        ...(differs ? { reason: reason.trim() } : {}),
        ...(anythingToSafe ? { bagNumber: bag.trim() } : {}),
        ...(approvalId ? { approvalId } : {}),
      }),
    onSuccess: async (closed) => {
      toast.success(
        closed.status === 'closed' && dec(closed.dropNgn).greaterThan(0) && closed.dropBagNumber
          ? `Shift ${closed.number} closed · ${naira(closed.dropNgn)} to the safe in bag ${closed.dropBagNumber}`
          : `Shift ${closed.number} closed${differs ? '' : ' · balanced'}`,
      )
      onClosed(closed)
      await client.invalidateQueries({ queryKey: orpc.cash.key() })
    },
    onError: (error) => {
      key.current = newId()
      const code = errorCode(error)
      const field =
        code === 'DIFFERENCE_REASON_REQUIRED'
          ? 'reason'
          : code === 'FLOAT_MORE_THAN_CASH'
            ? 'floatKept'
            : code === 'BAG_NUMBER_REQUIRED'
              ? 'bagNumber'
              : 'form'
      if (code?.startsWith('APPROVAL_')) approval.reset()
      setProblems({ [field]: problemMessage(error) })
    },
  })

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!online || close.isPending) return
    const found: typeof problems = {}
    if (differs && reason.trim().length < 5) found.reason = 'Add a reason for the difference.'
    const floatProblem = amountProblem(floatKept)
    if (floatProblem || floatKept.trim() === '')
      found.floatKept = floatProblem ?? 'Enter the float, or 0.'
    else if (dec(kept).greaterThan(shift.cashCounted)) {
      found.floatKept = `The float can't be more than the ${naira(shift.cashCounted)} counted.`
    }
    if (anythingToSafe && !/^[A-Za-z0-9-]{1,20}$/.test(bag.trim())) {
      found.bagNumber = 'Enter the safe bag number.'
    }
    setProblems(found)
    if (Object.keys(found).length > 0) {
      focusFirstProblem(formId)
      return
    }
    if (needsApproval && !approval.approvedId) {
      approval.ask()
      return
    }
    close.mutate(approval.approvedId)
  }

  const primary =
    needsApproval && !approval.approvedId
      ? `Ask for approval · ${naira(total)}`
      : closeLabel(dropNgn)

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <PageHeader
        title={`Cashier shift ${shift.number} · ${dateLabel(shift.businessDate)}`}
        badge={
          <StatusBadge tone="slate">
            Count submitted {clockAt(shift.countedAt, tz)} · locked
          </StatusBadge>
        }
        description={`${shift.member.name} · ${shift.drawer.name} · step 2 of 2: close`}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <TakingsTable lines={shift.lines} openingFloat={shift.openingFloat} />
          {shift.lines[0]?.notes ? (
            <NoteCount
              title="Cash count · ₦"
              hint="counted before seeing the expected figure"
              totalLabel="Counted"
              count={shift.lines[0].notes}
            />
          ) : null}
        </div>
        <Card className="flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="font-semibold">Close shift</h2>
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {differs ? (
              <div className="num flex flex-col gap-1 rounded-sm bg-surface-2 px-3 py-2.5">
                <span className="font-medium text-ro">{differenceLine(shift.lines, total)}</span>
                <span className={cn('text-sm', needsApproval ? 'text-am' : 'text-text-3')}>
                  {limitLine(total, shift.limit)}
                </span>
              </div>
            ) : null}
            {differs ? (
              <ReasonField
                id={`${formId}-reason`}
                value={reason}
                suggestions={CLOSE_SUGGESTIONS}
                hint="Recorded with your name."
                error={problems.reason}
                onChange={(next) => {
                  setReason(next)
                  setProblems({})
                }}
              />
            ) : null}
            <Field
              label="Float stays in drawer"
              prefix="₦"
              inputMode="decimal"
              name="floatKept"
              value={floatKept}
              error={problems.floatKept}
              onChange={(event) => {
                setFloatKept(event.target.value)
                setProblems({})
              }}
              className="num text-right max-lg:h-11"
            />
            <dl className="num flex flex-col gap-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-text-2">To the safe</dt>
                <dd className="font-medium">{naira(dropNgn)}</dd>
              </div>
              {foreign.length > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-text-2">Foreign cash to the safe</dt>
                  <dd>{foreign.map((l) => foreignShort(l.counted, l.currency)).join(' · ')}</dd>
                </div>
              ) : null}
            </dl>
            {anythingToSafe ? (
              <Field
                label="Safe bag number"
                name="bagNumber"
                value={bag}
                maxLength={20}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                hint="e.g. S-2211"
                error={problems.bagNumber}
                onChange={(event) => {
                  setBag(event.target.value.toUpperCase())
                  setProblems({})
                }}
                className="num max-lg:h-11"
              />
            ) : null}
            {approval.view ? <ApprovalLine view={approval.view} timeZone={tz} /> : null}
            {problems.form ? (
              <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-sm text-ro">
                {problems.form}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 max-lg:sticky max-lg:bottom-0 max-lg:-mx-4 max-lg:border-t max-lg:border-border max-lg:bg-surface max-lg:px-4 max-lg:py-3">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!online}
                loading={close.isPending}
              >
                {primary}
              </Button>
              {online ? null : (
                <span className="text-sm text-text-3">{CLOSE_NEEDS_CONNECTION}</span>
              )}
            </div>
          </div>
        </Card>
      </div>
      <CashApprovalPrompt
        approval={approval}
        action={action}
        timeZone={tz}
        approveLabel="Approve and close shift"
        onApproved={(view: ApprovalView) => close.mutate(view.id)}
      />
    </form>
  )
}
