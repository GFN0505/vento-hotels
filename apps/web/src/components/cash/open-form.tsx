// Open cashier shift (design #34, Cash view open; phone CashOpenM): the drawer, the float counted
// by note, and the hand-over aside comparing it live with what the drawer's last shift kept. A
// difference needs a reason, and above the opener's limit a manager's approval (here by PIN, or in
// their inbox). Enter opens. Opening needs a connection.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type ApprovalView,
  clockAt,
  type DrawerChoice,
  dec,
  HANDOVER_SUGGESTIONS,
  type MyShift,
  newId,
  type ShiftView,
  toAmount,
} from '@vento/shared'
import { type FormEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { ApprovalLine, CashApprovalPrompt, useCashApproval } from './approval-flow'
import { CountLeaveGuard } from './count-leave'
import {
  type CountDraft,
  draftProblems,
  draftTotal,
  EMPTY_DRAFT,
  isDraftEmpty,
  toCount,
} from './count-model'
import { compareWords, dateLabel, handoverDifference, limitLine, naira, overLimit } from './format'
import { NoteCount } from './note-count'
import { ReasonField } from './reason-field'

// After the problems render: the first field that has one.
export function focusFirstProblem(formId: string) {
  requestAnimationFrame(() =>
    document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
  )
}

export const OPEN_NEEDS_CONNECTION = 'Opening a shift needs a connection.'

const DRAWER_KEY = (hotelId: string) => `vento.cash.drawer.${hotelId}`

function rememberedDrawer(hotelId: string): string | undefined {
  try {
    return localStorage.getItem(DRAWER_KEY(hotelId)) ?? undefined
  } catch {
    return undefined
  }
}

function rememberDrawer(hotelId: string, drawerId: string) {
  try {
    localStorage.setItem(DRAWER_KEY(hotelId), drawerId)
  } catch {
    // Storage blocked: the first free drawer next time.
  }
}

// The drawer last opened in this browser, else the first free one.
function defaultDrawer(data: MyShift): DrawerChoice | undefined {
  const free = data.drawers.filter((d) => !d.busy)
  const remembered = free.find((d) => d.id === rememberedDrawer(data.hotel.id))
  return remembered ?? free[0]
}

export function OpenForm({
  data,
  onOpened,
}: {
  data: MyShift
  onOpened: (shift: ShiftView) => void
}) {
  const online = useOnline()
  const client = useQueryClient()
  const formId = useId()
  const [drawerId, setDrawerId] = useState(() => defaultDrawer(data)?.id)
  const drawer = data.drawers.find((d) => d.id === drawerId && !d.busy) ?? defaultDrawer(data)
  const [draft, setDraft] = useState<CountDraft>(EMPTY_DRAFT)
  const [reason, setReason] = useState('')
  const [problems, setProblems] = useState<
    Partial<Record<keyof CountDraft | 'reason' | 'form', string>>
  >({})
  // One shift id and key per attempt: a double click or a retry opens the same shift.
  const ids = useRef({ id: newId(), key: newId() })
  const approval = useCashApproval(reason)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const counted = draftTotal(draft)
  const last = drawer?.lastClose ?? null
  const floatLeft = last?.floatKept ?? '0.00'
  const difference = handoverDifference(counted, floatLeft)
  const differs = !dec(difference).isZero()
  const value = toAmount(dec(difference).abs())
  const needsApproval = differs && overLimit(value, data.limit)
  const compare = compareWords(difference)
  const allBusy = data.drawers.length > 0 && data.drawers.every((d) => d.busy)
  const tz = data.hotel.timeZone

  const action = useMemo(
    () => ({
      kind: 'cash_variance' as const,
      variance: {
        stage: 'handover' as const,
        propertyId: data.hotel.id,
        drawerId: drawer?.id ?? '',
        shiftId: ids.current.id,
        handoverFromShiftId: last?.shiftId ?? null,
        count: toCount(draft),
        reason: reason.trim(),
      },
    }),
    [data.hotel.id, drawer?.id, last?.shiftId, draft, reason],
  )

  const open = useMutation({
    mutationFn: (approvalId?: string) =>
      api.cash.open({
        idempotencyKey: ids.current.key,
        id: ids.current.id,
        propertyId: data.hotel.id,
        drawerId: drawer?.id ?? '',
        count: toCount(draft),
        handoverFromShiftId: last?.shiftId ?? null,
        ...(differs ? { reason: reason.trim() } : {}),
        ...(approvalId ? { approvalId } : {}),
      }),
    onSuccess: async (shift) => {
      if (drawer) rememberDrawer(data.hotel.id, drawer.id)
      toast.success(
        `Shift ${shift.number} open on ${shift.drawer.name} · ${naira(shift.openingFloat)} float`,
      )
      onOpened(shift)
      await client.invalidateQueries({ queryKey: orpc.cash.key() })
    },
    onError: async (error) => {
      const code = errorCode(error)
      if (code === 'HANDOVER_CHANGED' || code === 'DRAWER_BUSY' || code === 'DRAWER_ARCHIVED') {
        // Someone else moved first: a new attempt, and the hand-over as it is now.
        ids.current = { id: newId(), key: newId() }
        approval.reset()
        await client.invalidateQueries({ queryKey: orpc.cash.myShift.key() })
      }
      if (code === 'DIFFERENCE_REASON_REQUIRED') setProblems({ reason: problemMessage(error) })
      else setProblems({ form: problemMessage(error) })
    },
  })

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!online || open.isPending || !drawer) return
    const found: typeof problems = draftProblems(draft)
    if (differs && reason.trim().length < 5) found.reason = 'Add a reason for the difference.'
    setProblems(found)
    if (Object.keys(found).length > 0) {
      focusFirstProblem(formId)
      return
    }
    if (needsApproval && !approval.approvedId) {
      approval.ask()
      return
    }
    open.mutate(approval.approvedId)
  }

  const primaryLabel =
    needsApproval && !approval.approvedId
      ? `Ask for approval · ${naira(value)}`
      : dec(counted).isZero()
        ? 'Open shift with no float'
        : `Open shift · ${naira(counted)} float`

  if (data.drawers.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Open cashier shift" />
        <Card className="p-5 text-text-2">
          {data.hotel.name} has no cash drawers. Ask finance to add one on Settings › Payments.
        </Card>
      </div>
    )
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <CountLeaveGuard dirty={!isDraftEmpty(draft) && !open.isSuccess} />
      <PageHeader
        title="Open cashier shift"
        description={
          <span className="num">
            {data.hotel.name} · {drawer?.name ?? 'No drawer free'} · business date{' '}
            {dateLabel(data.hotel.businessDate)} · {clockAt(now, tz)}
          </span>
        }
      />
      {data.drawers.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-text-2">Drawer</legend>
          <div className="flex flex-wrap gap-2">
            {data.drawers.map((d) => {
              const on = d.id === drawer?.id
              return (
                <label
                  key={d.id}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium lg:min-h-9',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    d.busy
                      ? 'cursor-not-allowed border-border bg-surface-2 text-text-3'
                      : on
                        ? 'cursor-pointer border-pri bg-pri-soft text-pri-ink'
                        : 'cursor-pointer border-border-strong bg-surface hover:bg-surface-2',
                  )}
                >
                  <input
                    type="radio"
                    name="drawer"
                    className="sr-only"
                    checked={on}
                    disabled={Boolean(d.busy)}
                    onChange={() => {
                      setDrawerId(d.id)
                      approval.reset()
                    }}
                  />
                  {d.busy ? `${d.name} · ${d.busy.memberName}'s shift` : d.name}
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}
      {allBusy ? (
        <p role="status" className="rounded-md bg-am-bg px-4 py-3 text-am">
          Every drawer at {data.hotel.name} has a shift open. Ask finance to add a drawer, or wait
          for one to close.
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <NoteCount
          title="Count the float you received"
          hint="by note"
          totalLabel="Float counted"
          draft={draft}
          idPrefix={formId}
          disabled={!drawer}
          problems={problems}
          onChange={(next) => {
            setDraft(next)
            setProblems({})
          }}
        />
        <Card className="flex flex-col">
          <h2 className="border-b border-border px-4 py-3 font-semibold">Hand-over</h2>
          <div className="flex flex-col gap-3 p-4">
            {last && !dec(floatLeft).isZero() ? (
              <dl className="num flex flex-col gap-2">
                <Row label="From">
                  {last.memberName} · shift {last.number} of {dateLabel(last.businessDate, false)} ·
                  closed {clockAt(last.closedAt, tz)}
                </Row>
                <Row label="Float handed over">{naira(floatLeft)}</Row>
                <Row label="You counted">
                  <span
                    className={cn(
                      'font-medium',
                      compare.tone === 'emerald' ? 'text-em' : 'text-ro',
                    )}
                  >
                    {naira(counted)} · {compare.text}
                  </span>
                </Row>
              </dl>
            ) : (
              <p className="text-text-2">
                First shift on {drawer?.name ?? 'this drawer'}. Count the float you were given.
              </p>
            )}
            {drawer && drawer.terminals.length > 0 ? (
              <dl className="flex flex-col gap-2">
                <Row label="POS terminal">{drawer.terminals.map((t) => t.label).join(', ')}</Row>
              </dl>
            ) : null}
            {differs ? (
              <>
                <ReasonField
                  id={`${formId}-reason`}
                  value={reason}
                  suggestions={HANDOVER_SUGGESTIONS}
                  hint={
                    approval.view?.status === 'approved' && approval.view.approver
                      ? `Recorded with your name and ${approval.view.approver.name}'s.`
                      : 'Recorded with your name.'
                  }
                  error={problems.reason}
                  onChange={(next) => {
                    setReason(next)
                    setProblems({})
                  }}
                />
                <p className={cn('text-sm', needsApproval ? 'text-am' : 'text-text-3')}>
                  {limitLine(value, data.limit)}
                </p>
              </>
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
                disabled={!online || !drawer}
                loading={open.isPending}
              >
                {primaryLabel}
                <kbd className="ml-1 hidden rounded-[4px] bg-white/20 px-1.5 text-xs lg:inline">
                  ↵
                </kbd>
              </Button>
              <span className="text-sm text-text-3">
                {online
                  ? 'At close you count blind: expected totals stay hidden until you submit.'
                  : OPEN_NEEDS_CONNECTION}
              </span>
            </div>
          </div>
        </Card>
      </div>
      <CashApprovalPrompt
        approval={approval}
        action={action}
        timeZone={tz}
        approveLabel="Approve and open shift"
        onApproved={(view: ApprovalView) => open.mutate(view.id)}
      />
    </form>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
      <dt className="text-text-2">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  )
}
