// Archive, restore and delete a rate plan, from the list or the editor. Archive asks first (it
// stops new bookings on the plan) and then offers Undo; delete for good asks with the plan's name.
import { useMutation } from '@tanstack/react-query'
import type { LoweredTonight, RatePlanView } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errorCode, problemMessage } from '@/lib/errors'
import { ConfirmDialog } from './confirm-dialog'
import { LoweredDialog, loweredFrom } from './lowered-dialog'
import { useRatesRefresh } from './queries'

type Plan = Pick<RatePlanView, 'id' | 'name'>
type Ask = { kind: 'archive' | 'delete'; plan: Plan }

export function usePlanActions(options: { onDeleted?: () => void } = {}) {
  const refresh = useRatesRefresh()
  const [ask, setAsk] = useState<Ask>()
  const [error, setError] = useState<string>()

  // Restoring after go-live can bring a price back cheaper than earlier today: that asks why.
  const [restoreAsk, setRestoreAsk] = useState<{ plan: Plan; rows: LoweredTonight[] }>()
  const [restoreError, setRestoreError] = useState<string>()
  const restore = useMutation({
    mutationFn: ({ plan, reason }: { plan: Plan; reason?: string }) =>
      api.ratePlans.restore({ id: plan.id, ...(reason ? { reason } : {}) }),
    onSuccess: async (plan) => {
      setRestoreAsk(undefined)
      await refresh()
      toast.success(`${plan.name} restored`)
    },
    onError: (failure, { plan }) => {
      if (errorCode(failure) === 'REASON_REQUIRED') {
        if (restoreAsk) setRestoreError(problemMessage(failure))
        else setRestoreAsk({ plan, rows: loweredFrom(failure) })
        return
      }
      toast.error(problemMessage(failure))
    },
  })

  const archive = useMutation({
    mutationFn: (plan: Plan) => api.ratePlans.archive({ id: plan.id }),
    onSuccess: async (plan) => {
      setAsk(undefined)
      await refresh()
      toast.success(`${plan.name} archived`, {
        action: { label: 'Undo', onClick: () => restore.mutate({ plan }) },
      })
    },
    onError: (failure) => setError(problemMessage(failure)),
  })

  const remove = useMutation({
    mutationFn: (plan: Plan) => api.ratePlans.delete({ id: plan.id }),
    onSuccess: async (_, plan) => {
      setAsk(undefined)
      options.onDeleted?.()
      await refresh()
      toast.success(`${plan.name} deleted`)
    },
    onError: (failure) => setError(problemMessage(failure)),
  })

  const open = (kind: Ask['kind'], plan: Plan) => {
    setError(undefined)
    setAsk({ kind, plan })
  }

  const dialog = ask ? (
    ask.kind === 'archive' ? (
      <ConfirmDialog
        title={`Archive ${ask.plan.name}?`}
        confirmLabel="Archive plan"
        destructive
        pending={archive.isPending}
        error={error}
        onConfirm={() => archive.mutate(ask.plan)}
        onClose={() => setAsk(undefined)}
      >
        <p>
          It stops being offered for new bookings. Bookings already made keep their price and terms.
          You can restore it from Archived.
        </p>
      </ConfirmDialog>
    ) : (
      <ConfirmDialog
        title={`Delete ${ask.plan.name} for good?`}
        confirmLabel="Delete for good"
        destructive
        pending={remove.isPending}
        error={error}
        onConfirm={() => remove.mutate(ask.plan)}
        onClose={() => setAsk(undefined)}
      >
        <p>It was never used on a booking, so nothing else changes. This can't be undone.</p>
      </ConfirmDialog>
    )
  ) : null

  return {
    archive: (plan: Plan) => open('archive', plan),
    remove: (plan: Plan) => open('delete', plan),
    restore: (plan: Plan) => restore.mutate({ plan }),
    restoring: restore.isPending ? restore.variables?.plan.id : undefined,
    dialog: (
      <>
        {dialog}
        {restoreAsk ? (
          <LoweredDialog
            lowered={restoreAsk.rows}
            confirmLabel={`Restore ${restoreAsk.plan.name}`}
            pending={restore.isPending}
            error={restoreError}
            onConfirm={(reason) => restore.mutate({ plan: restoreAsk.plan, reason })}
            onClose={() => {
              setRestoreAsk(undefined)
              setRestoreError(undefined)
            }}
          />
        ) : null}
      </>
    ),
  }
}
