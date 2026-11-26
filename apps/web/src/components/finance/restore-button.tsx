// Restore an archived bank account or POS terminal, from its row. Like archiving, it asks why: on a
// live hotel the reason is required and the change shows in the owner's daily report.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'

type Props = { kind: 'account' | 'terminal'; id: string; propertyId: string; label: string }

export function RestoreButton({ kind, id, propertyId, label }: Props) {
  const client = useQueryClient()
  const [asking, setAsking] = useState(false)
  const restore = useMutation({
    mutationFn: async (reason: string): Promise<unknown> =>
      kind === 'account'
        ? api.bankAccounts.restore({ propertyId, id, reason })
        : api.posTerminals.restore({ propertyId, id, reason }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: orpc.bankAccounts.key() }),
        client.invalidateQueries({ queryKey: orpc.posTerminals.key() }),
        client.invalidateQueries({ queryKey: orpc.paymentMethods.key() }),
      ])
      setAsking(false)
      toast.success(`${label} restored`)
    },
  })
  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label={`Restore ${label}`}
        className="inline-flex min-h-11 flex-none items-center text-sm font-medium text-pri-ink hover:underline md:min-h-0"
      >
        Restore
      </button>
      <ReasonDialog
        open={asking}
        title={`Restore ${label}`}
        description="Recorded with your name. On a live hotel this shows in the owner's daily report."
        label="Reason"
        confirmLabel="Restore"
        pending={restore.isPending}
        error={restore.error ? problemMessage(restore.error) : undefined}
        onConfirm={(reason) => restore.mutate(reason)}
        onClose={() => {
          restore.reset()
          setAsking(false)
        }}
      />
    </>
  )
}
