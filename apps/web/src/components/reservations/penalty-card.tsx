// The Penalty card on a cancelled, no-show or late-changed reservation (spec: "Reservation detail";
// built from the card pattern): amount and basis, To charge / Waiver asked / Waived with who and
// why, and Waive penalty (managers) or Ask to waive (others), until brick 10 posts it.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  firstNameOf,
  newId,
  PENALTY_KIND_LABELS,
  type PenaltyView,
  type ReservationDetail,
} from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { ApprovalPrompt } from '@/components/approvals/approval-prompt'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { NEEDS_CONNECTION, penaltyState } from './change-model'
import { naira } from './format'

export function PenaltyCard({ detail }: { detail: ReservationDetail }) {
  const penalties = detail.penalties
  if (penalties.length === 0 && !detail.end) return null
  return (
    <Card>
      <h2 className="border-b border-border px-5 py-3.5 text-[15px] font-semibold">Penalty</h2>
      {penalties.length === 0 ? (
        <p className="px-5 py-4 text-text-2">No penalty</p>
      ) : (
        <ul className="divide-y divide-border">
          {penalties.map((penalty) => (
            <PenaltyRow key={penalty.id} penalty={penalty} detail={detail} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function PenaltyRow({ penalty, detail }: { penalty: PenaltyView; detail: ReservationDetail }) {
  const online = useOnline()
  const queryClient = useQueryClient()
  const tz = detail.property.timeZone
  const state = penaltyState(penalty, {
    canWaive: detail.actions.canWaive,
    canManage: detail.actions.canManage,
    timeZone: tz,
  })
  const [dialog, setDialog] = useState<'waive' | 'ask' | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [failure, setFailure] = useState<string>()
  const key = useState(() => newId())[0]
  const waive = useMutation(orpc.penalties.waive.mutationOptions())
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.reservations.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.approvals.key() }),
    ])
  const doWaive = async (reason: string, approvalId?: string) => {
    setFailure(undefined)
    try {
      await waive.mutateAsync({
        idempotencyKey: key,
        penaltyId: penalty.id,
        reason,
        ...(approvalId ? { approvalId } : {}),
      })
      toast.success('Penalty waived')
      setDialog(null)
      setAsking(null)
      void refresh()
    } catch (error) {
      setFailure(problemMessage(error))
      void refresh()
    }
  }
  const amount = naira(penalty.amount)
  return (
    <li className="flex flex-col gap-2 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="num text-lg font-semibold">{amount}</span>
        <StatusBadge tone={state.tone}>{state.badge}</StatusBadge>
      </div>
      <span className="text-sm text-text-2">
        {PENALTY_KIND_LABELS[penalty.kind]} · {penalty.basisLabel}
      </span>
      {state.line ? <p className="text-sm break-words text-text-2">{state.line}</p> : null}
      {state.action ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="max-lg:h-11"
            disabled={!online}
            onClick={() => setDialog(state.action === 'waive' ? 'waive' : 'ask')}
          >
            {state.action === 'waive'
              ? 'Waive penalty'
              : state.action === 'ask_again'
                ? 'Ask again'
                : 'Ask to waive'}
          </Button>
          {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
        </div>
      ) : null}
      {dialog ? (
        <ReasonDialog
          open={!asking}
          title={dialog === 'waive' ? `Waive penalty · ${amount}` : `Ask to waive ${amount}`}
          description={`${detail.number} · ${detail.guest.firstName} ${detail.guest.lastName}`}
          label="Reason for waiving"
          hint="Recorded with your name. This shows in the owner's daily report."
          confirmLabel={dialog === 'waive' ? `Waive ${amount}` : 'Ask a manager'}
          pending={waive.isPending}
          error={failure}
          onConfirm={(reason) => {
            if (dialog === 'waive') void doWaive(reason)
            else setAsking(reason)
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {asking ? (
        <ApprovalPrompt
          action={{
            kind: 'penalty_waiver',
            waiver: { target: 'penalty', penaltyId: penalty.id, reason: asking },
          }}
          timeZone={tz}
          approveLabel="Approve waiver"
          onApproved={(approval) => void doWaive(asking, approval.id)}
          onSent={(approval) => {
            toast.success(`Waiver sent to ${firstNameOf(approval.approver?.name ?? 'the manager')}`)
            setAsking(null)
            setDialog(null)
            void refresh()
          }}
          onClose={() => setAsking(null)}
        />
      ) : null}
    </li>
  )
}
