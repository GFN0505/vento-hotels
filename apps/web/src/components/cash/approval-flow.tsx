// Asking for a cash difference to be approved (brick 5's prompt, kind `cash_variance`): the PIN
// here on a registered hotel device, which opens or closes the shift at once, or a request to a
// manager's inbox, which this screen waits on ("Waiting for Tunde Bello · asked 06:46 · expires
// 07:16"). Changing what was asked (the count, the drawer or the reason) cancels the request, so
// the approval always matches what will be sent.
import { useMutation, useQuery } from '@tanstack/react-query'
import { type ApprovalActionInput, type ApprovalView, firstNameOf } from '@vento/shared'
import { lazy, Suspense, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { answerLine } from '@/components/approvals/format'
import { StatusBadge } from '@/components/ui/status-badge'
import { api, orpc } from '@/lib/api'

const ApprovalPrompt = lazy(() =>
  import('@/components/approvals/approval-prompt').then((m) => ({ default: m.ApprovalPrompt })),
)

// `signature`: everything the approval is bound to, as one string.
export function useCashApproval(signature: string) {
  const [sent, setSent] = useState<{ view: ApprovalView; signature: string }>()
  const [asking, setAsking] = useState(false)
  const poll = useQuery({
    ...orpc.approvals.get.queryOptions({ input: { id: sent?.view.id ?? '' } }),
    enabled: Boolean(sent),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 4000 : false),
  })
  const view = sent ? (poll.data ?? sent.view) : undefined
  const cancel = useMutation({
    mutationFn: (id: string) => api.approvals.cancel({ id, reason: 'by_requester' }),
  })
  // What was asked changed: the request (or the approval given) no longer matches, so it goes.
  useEffect(() => {
    if (!sent || sent.signature === signature) return
    const name = firstNameOf(sent.view.approver?.name ?? 'the manager')
    if (view?.status === 'pending') {
      cancel.mutate(sent.view.id)
      toast(`Request to ${name} cancelled`)
    }
    setSent(undefined)
  }, [signature, sent, view?.status, cancel])
  const approvedId = view?.status === 'approved' && !view.usedAt ? view.id : undefined
  return {
    view,
    approvedId,
    asking,
    ask: () => setAsking(true),
    stopAsking: () => setAsking(false),
    sentTo: (approval: ApprovalView) => {
      setSent({ view: approval, signature })
      setAsking(false)
      toast.success(`Sent to ${approval.approver?.name ?? 'the manager'}`)
    },
    reset: () => setSent(undefined),
  }
}

export type CashApproval = ReturnType<typeof useCashApproval>

export function CashApprovalPrompt({
  approval,
  action,
  timeZone,
  approveLabel,
  onApproved,
}: {
  approval: CashApproval
  action: ApprovalActionInput
  timeZone: string
  approveLabel: string
  onApproved: (approval: ApprovalView) => void
}) {
  if (!approval.asking) return null
  return (
    <Suspense fallback={null}>
      <ApprovalPrompt
        action={action}
        timeZone={timeZone}
        approveLabel={approveLabel}
        onApproved={(view) => {
          approval.stopAsking()
          onApproved(view)
        }}
        onSent={approval.sentTo}
        onClose={approval.stopAsking}
      />
    </Suspense>
  )
}

// The request's state on the screen: waiting, approved, declined or expired.
export function ApprovalLine({ view, timeZone }: { view: ApprovalView; timeZone: string }) {
  const tone =
    view.status === 'approved' ? 'emerald' : view.status === 'pending' ? 'amber' : 'slate'
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-text-2">
      <StatusBadge tone={tone}>
        {view.status === 'approved'
          ? 'Approved'
          : view.status === 'pending'
            ? 'Waiting'
            : view.status === 'declined'
              ? 'Declined'
              : 'Expired'}
      </StatusBadge>
      <span className="num">{answerLine(view, timeZone)}</span>
    </p>
  )
}
