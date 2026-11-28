// Step 1 of 2, the blind count (design #34 ShiftClose, counting): naira cash by note, then each
// other line the server lists (foreign cash, each POS terminal's merchant slips, bank transfers),
// with no expected figure anywhere. Submit asks once with every figure, then the count is locked.
// The typed count lives only on this screen; a request cut off by the connection is sent again
// with the same key when it returns.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type CountLine,
  cashAmount,
  type FxCurrency,
  newId,
  type OpenShift,
  type ShiftView,
} from '@vento/shared'
import { EyeOff } from 'lucide-react'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, isConnectionProblem, problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { CountLeaveGuard } from './count-leave'
import {
  amountOf,
  amountProblem,
  type CountDraft,
  draftProblems,
  draftTotal,
  EMPTY_DRAFT,
  isDraftEmpty,
  toCount,
} from './count-model'
import { confirmLine, foreignShort, naira } from './format'
import { NoteCount } from './note-count'
import { focusFirstProblem } from './open-form'

export const SUBMIT_NEEDS_CONNECTION =
  'Submitting a count needs a connection. Keep counting; your figures stay on this screen.'

const lineKey = (line: Pick<CountLine, 'kind' | 'currency' | 'posTerminalId'>) =>
  `${line.kind}-${line.currency}-${line.posTerminalId ?? ''}`

// "Cash US$", "POS", "Transfers": the short names the summary and the confirm use.
function shortName(line: CountLine) {
  if (line.kind === 'pos_terminal') return 'POS'
  if (line.kind === 'bank_transfer') return 'Transfers'
  return line.currency === 'NGN' ? 'Cash' : line.label
}

const shownIn = (line: CountLine, amount: string) =>
  cashAmount(amount, line.kind === 'cash' ? (line.currency as 'NGN' | FxCurrency) : 'NGN')

export function CountStep({
  shift,
  onCounted,
  onBack,
}: {
  shift: OpenShift
  onCounted: (shift: ShiftView) => void
  onBack: () => void
}) {
  const online = useOnline()
  const client = useQueryClient()
  const formId = useId()
  const lines = useQuery(orpc.cash.countLines.queryOptions({ input: { shiftId: shift.id } }))
  const [draft, setDraft] = useState<CountDraft>(EMPTY_DRAFT)
  const [others, setOthers] = useState<Record<string, string>>({})
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)
  // One key per count: a retry after a dropped connection is answered with the first result.
  const key = useRef(newId())
  const [waitingToRetry, setWaitingToRetry] = useState(false)
  const typed = !isDraftEmpty(draft) || Object.values(others).some((v) => v.trim() !== '')

  const otherLines = (lines.data?.lines ?? []).filter(
    (line) => !(line.kind === 'cash' && line.currency === 'NGN'),
  )

  const body = () => ({
    idempotencyKey: key.current,
    shiftId: shift.id,
    version: shift.version,
    cash: toCount(draft),
    foreign: otherLines
      .filter((l) => l.kind === 'cash')
      .map((l) => ({
        currency: l.currency as FxCurrency,
        amount: amountOf(others[lineKey(l)] ?? ''),
      })),
    pos: otherLines
      .filter((l) => l.kind === 'pos_terminal' && l.posTerminalId)
      .map((l) => ({
        posTerminalId: l.posTerminalId ?? '',
        amount: amountOf(others[lineKey(l)] ?? ''),
      })),
    transfers: otherLines.some((l) => l.kind === 'bank_transfer')
      ? amountOf(
          others[lineKey({ kind: 'bank_transfer', currency: 'NGN', posTerminalId: null })] ?? '',
        )
      : null,
  })

  const submit = useMutation({
    mutationFn: () => api.cash.submitCount(body()),
    onSuccess: async (counted) => {
      setWaitingToRetry(false)
      setConfirming(false)
      toast.success('Count submitted')
      onCounted(counted)
      await client.invalidateQueries({ queryKey: orpc.cash.key() })
    },
    onError: (error) => {
      setConfirming(false)
      if (isConnectionProblem(error as { status?: number })) {
        setWaitingToRetry(true)
        return
      }
      if (errorCode(error) === 'COUNT_ALREADY_SUBMITTED') {
        void client.invalidateQueries({ queryKey: orpc.cash.myShift.key() })
      }
      if (errorCode(error) === 'COUNT_LINES_CHANGED') void lines.refetch()
      setProblems({ form: problemMessage(error) })
    },
  })

  // Back online with a count sent just before the connection dropped: ask again, same key.
  useEffect(() => {
    if (online && waitingToRetry && !submit.isPending) submit.mutate()
  }, [online, waitingToRetry, submit])

  function check(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = { ...draftProblems(draft) }
    for (const line of otherLines) {
      const k = lineKey(line)
      const value = others[k] ?? ''
      const problem = amountProblem(value, line.kind === 'cash' ? '999999.99' : undefined)
      if (problem) found[k] = problem
      else if (line.required && value.trim() === '') {
        found[k] =
          line.kind === 'pos_terminal'
            ? 'Enter the slip total, or 0 if the terminal took nothing this shift.'
            : 'Enter the total of transfers you confirmed, or 0.'
      }
    }
    setProblems(found)
    if (Object.keys(found).length > 0) {
      focusFirstProblem(formId)
      return
    }
    setConfirming(true)
  }

  const summary = [
    { label: 'Cash ₦', amount: naira(draftTotal(draft)) },
    ...otherLines.map((line) => ({
      label: line.kind === 'pos_terminal' ? line.label : shortName(line),
      amount: shownIn(line, amountOf(others[lineKey(line)] ?? '')),
    })),
  ]
  const confirmParts = [
    `Cash ${naira(draftTotal(draft))}`,
    ...otherLines.map((line) => {
      const amount = amountOf(others[lineKey(line)] ?? '')
      return line.kind === 'cash'
        ? foreignShort(amount, line.currency)
        : `${shortName(line)} ${naira(amount)}`
    }),
  ]

  return (
    <form id={formId} onSubmit={check} noValidate className="flex flex-col gap-5">
      <CountLeaveGuard dirty={typed && !submit.isSuccess} />
      <PageHeader
        title={`Cashier shift ${shift.number} · step 1 of 2: count`}
        badge={<StatusBadge tone="blue">Blind count</StatusBadge>}
        description={`${shift.member.name} · ${shift.drawer.name}`}
        actions={
          <Button className="max-lg:h-11" onClick={onBack} disabled={submit.isPending}>
            Back to my shift
          </Button>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <NoteCount
            title="Cash ₦ in the drawer, including float"
            hint="count by note"
            totalLabel="Counted"
            draft={draft}
            idPrefix={formId}
            problems={problems}
            onChange={(next) => {
              setDraft(next)
              setProblems({})
            }}
          />
          {lines.isPending ? (
            <Card aria-busy="true" aria-label="Loading the lines to count" className="p-4">
              <span className="block h-11 animate-pulse rounded-sm bg-surface-2" />
            </Card>
          ) : otherLines.length > 0 ? (
            <Card>
              <h2 className="border-b border-border px-4 py-3 font-semibold">Other methods</h2>
              <ul className="divide-y divide-border">
                {otherLines.map((line) => {
                  const k = lineKey(line)
                  const id = `${formId}-${k}`
                  const problem = problems[k]
                  const prefix =
                    line.kind === 'cash' && line.currency !== 'NGN'
                      ? shownIn(line, '0').replace(/[\d.,]/g, '')
                      : '₦'
                  return (
                    <li key={k} className="flex flex-col gap-1 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex min-w-0 grow flex-col">
                          <label htmlFor={id} className="font-medium">
                            {line.label}
                          </label>
                          <span id={`${id}-hint`} className="text-sm text-text-3">
                            {line.hint}
                          </span>
                        </div>
                        <span className="relative max-sm:w-full">
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-text-3"
                          >
                            {prefix}
                          </span>
                          <input
                            id={id}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0.00"
                            value={others[k] ?? ''}
                            aria-invalid={problem ? true : undefined}
                            aria-describedby={`${id}-hint${problem ? ` ${id}-problem` : ''}`}
                            onChange={(event) => {
                              setOthers({ ...others, [k]: event.target.value })
                              setProblems({})
                            }}
                            className={cn(
                              'num h-11 w-full rounded-sm border border-input bg-surface pr-2.5 pl-8 text-right text-[16px] sm:w-48 lg:h-9 lg:text-base',
                              'focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none',
                              'aria-invalid:border-ro-dot aria-invalid:ring-3 aria-invalid:ring-ro-bg',
                            )}
                          />
                        </span>
                      </div>
                      {problem ? (
                        <span id={`${id}-problem`} className="text-sm text-ro">
                          {problem}
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </Card>
          ) : null}
        </div>
        <Card className="flex flex-col">
          <h2 className="border-b border-border px-4 py-3 font-semibold">Submit your count</h2>
          <div className="flex flex-col gap-3 p-4">
            <p className="flex items-start gap-2.5 rounded-sm bg-surface-2 p-3 text-sm text-text-2">
              <EyeOff className="mt-0.5 size-4 flex-none text-text-3" aria-hidden="true" />
              Expected totals stay hidden until you submit, so the count is your own. They appear
              with any difference straight after.
            </p>
            <dl className="num flex flex-col gap-1.5">
              {summary.map((part) => (
                <div key={part.label} className="flex justify-between gap-3">
                  <dt className="min-w-0 truncate text-text-2">{part.label}</dt>
                  <dd>{part.amount}</dd>
                </div>
              ))}
            </dl>
            {problems.form ? (
              <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-sm text-ro">
                {problems.form}
              </p>
            ) : null}
            {waitingToRetry ? (
              <p role="status" className="text-sm text-am">
                Checking whether your count was submitted…
              </p>
            ) : null}
            <div className="flex flex-col gap-2 max-lg:sticky max-lg:bottom-0 max-lg:-mx-4 max-lg:border-t max-lg:border-border max-lg:bg-surface max-lg:px-4 max-lg:py-3">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!online || lines.isPending || waitingToRetry}
                loading={submit.isPending}
              >
                Submit count
              </Button>
              <span className="text-sm text-text-3">
                {online ? "After you submit, the count can't be changed." : SUBMIT_NEEDS_CONNECTION}
              </span>
            </div>
          </div>
        </Card>
      </div>
      <Dialog
        open={confirming}
        onClose={() => (submit.isPending ? undefined : setConfirming(false))}
        title="Submit your count?"
        description={confirmLine(confirmParts).replace(/^Submit your count\? /, '')}
        footer={
          <>
            <Button onClick={() => setConfirming(false)} disabled={submit.isPending} data-autofocus>
              Keep counting
            </Button>
            <Button
              variant="primary"
              disabled={!online}
              loading={submit.isPending}
              onClick={() => submit.mutate()}
            >
              Submit count
            </Button>
          </>
        }
      >
        <p className="text-text-2">Expected totals and any difference appear straight after.</p>
      </Dialog>
    </form>
  )
}
