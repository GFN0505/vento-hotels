// Archive, restore and delete a rate plan, from the list or the editor. Archive asks first (it
// stops new bookings on the plan) and then offers Undo; delete for good asks with the plan's name.
import { useMutation } from '@tanstack/react-query'
import type { RatePlanView } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { ConfirmDialog } from './confirm-dialog'
import { useRatesRefresh } from './queries'

type Plan = Pick<RatePlanView, 'id' | 'name'>
type Ask = { kind: 'archive' | 'delete'; plan: Plan }

export function usePlanActions(options: { onDeleted?: () => void } = {}) {
  const refresh = useRatesRefresh()
  const [ask, setAsk] = useState<Ask>()
  const [error, setError] = useState<string>()

  const restore = useMutation({
    mutationFn: (plan: Plan) => api.ratePlans.restore({ id: plan.id }),
    onSuccess: async (plan) => {
      await refresh()
      toast.success(`${plan.name} restored`)
    },
    onError: (failure) => toast.error(problemMessage(failure)),
  })

  const archive = useMutation({
    mutationFn: (plan: Plan) => api.ratePlans.archive({ id: plan.id }),
    onSuccess: async (plan) => {
      setAsk(undefined)
      await refresh()
      toast.success(`${plan.name} archived`, {
        action: { label: 'Undo', onClick: () => restore.mutate(plan) },
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
    restore: (plan: Plan) => restore.mutate(plan),
    restoring: restore.isPending ? restore.variables?.id : undefined,
    dialog,
  }
}
