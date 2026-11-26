// Restore an archived bank account or POS terminal, from its row.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'

type Props = {
  kind: 'account' | 'terminal'
  id: string
  propertyId: string
  live: boolean
  label: string
}

export function RestoreButton({ kind, id, propertyId, label }: Props) {
  const client = useQueryClient()
  const restore = useMutation({
    mutationFn: async (): Promise<unknown> =>
      kind === 'account'
        ? api.bankAccounts.restore({ propertyId, id })
        : api.posTerminals.restore({ propertyId, id }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: orpc.bankAccounts.key() }),
        client.invalidateQueries({ queryKey: orpc.posTerminals.key() }),
        client.invalidateQueries({ queryKey: orpc.paymentMethods.key() }),
      ])
      toast.success(`${label} restored`)
    },
    onError: (error) => toast.error(problemMessage(error)),
  })
  return (
    <button
      type="button"
      onClick={() => restore.mutate()}
      disabled={restore.isPending}
      aria-label={`Restore ${label}`}
      className="inline-flex min-h-11 flex-none items-center text-sm font-medium text-pri-ink hover:underline md:min-h-0"
    >
      Restore
    </button>
  )
}
