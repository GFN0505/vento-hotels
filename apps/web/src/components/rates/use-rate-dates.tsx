// Applying date prices and restrictions (an inline cell edit or Change dates) and undoing them.
// Money waits for the server: nothing is shown as changed until it answers. Each apply carries a
// UUID v7 batch id, which Undo names. After go-live, lowering tonight's price asks for a reason in
// the same dialog (REASON_REQUIRED lists what would go down), for applies and undos alike.
import { useMutation } from '@tanstack/react-query'
import { type LoweredTonight, newId } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errorCode, problemMessage } from '@/lib/errors'
import { listNames } from './format'
import { LoweredDialog, loweredFrom } from './lowered-dialog'
import { useRatesRefresh } from './queries'

export type DatesInput = Omit<Parameters<typeof api.rates.setDates>[0], 'batchId' | 'reason'>
type Apply = {
  input: DatesInput
  message: (dates: number) => string
  done?: (() => void) | undefined
}
type Undo = { ratePlanId: string; batchId: string }
type Ask =
  | { kind: 'apply'; apply: Apply; rows: LoweredTonight[] }
  | { kind: 'undo'; undo: Undo; rows: LoweredTonight[] }

const follows = (names: readonly string[]) =>
  names.length === 0
    ? undefined
    : `${listNames(names)} ${names.length === 1 ? 'follows' : 'follow'} automatically.`

export function useRateDates() {
  const refresh = useRatesRefresh()
  const [ask, setAsk] = useState<Ask>()
  const [askError, setAskError] = useState<string>()

  function failed(error: unknown, retry: Ask | undefined): string | undefined {
    if (errorCode(error) === 'REASON_REQUIRED' && retry) {
      if (ask) setAskError(problemMessage(error))
      else setAsk({ ...retry, rows: loweredFrom(error) })
      return undefined
    }
    setAsk(undefined)
    return problemMessage(error)
  }

  const undo = useMutation({
    mutationFn: ({ reason, ...target }: Undo & { reason?: string }) =>
      api.rates.undoDates({ ...target, ...(reason ? { reason } : {}) }),
    onSuccess: async (result) => {
      setAsk(undefined)
      await refresh()
      if (result.message) toast.info(result.message)
      else toast.success('Change undone')
    },
    onError: (error, target) => {
      const message = failed(error, { kind: 'undo', undo: target, rows: [] })
      if (message) toast.error(message)
    },
  })

  const apply = useMutation({
    mutationFn: ({ apply: a, reason }: { apply: Apply; reason?: string }) =>
      api.rates.setDates({ ...a.input, batchId: newId(), ...(reason ? { reason } : {}) }),
    onSuccess: async (result, { apply: a }) => {
      setAsk(undefined)
      a.done?.()
      await refresh()
      if (result.changed === 0) {
        toast.info('Nothing changed. Those dates already had these values.')
        return
      }
      const target = { ratePlanId: a.input.ratePlanId, batchId: result.batchId }
      toast.success(a.message(result.dates), {
        description: follows(result.followers),
        action: { label: 'Undo', onClick: () => undo.mutate(target) },
      })
    },
    onError: (error, { apply: a }) => {
      const message = failed(error, { kind: 'apply', apply: a, rows: [] })
      if (message) toast.error(message, { id: 'rate-dates' })
    },
  })

  const dialog = ask ? (
    <LoweredDialog
      lowered={ask.rows}
      confirmLabel={ask.kind === 'undo' ? 'Undo change' : 'Change price'}
      pending={apply.isPending || undo.isPending}
      error={askError}
      onConfirm={(reason) =>
        ask.kind === 'undo'
          ? undo.mutate({ ...ask.undo, reason })
          : apply.mutate({ apply: ask.apply, reason })
      }
      onClose={() => {
        setAsk(undefined)
        setAskError(undefined)
      }}
    />
  ) : null

  return {
    apply: (input: DatesInput, message: Apply['message'], done?: () => void) =>
      apply.mutate({ apply: { input, message, done } }),
    pending: apply.isPending,
    // The cell being saved inline, so it can show it's waiting.
    pendingInput: apply.isPending ? apply.variables?.apply.input : undefined,
    dialog,
  }
}

export type RateDates = ReturnType<typeof useRateDates>
