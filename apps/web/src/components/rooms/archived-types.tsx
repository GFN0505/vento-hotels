// Removed room types, folded away under the table, each with Restore. Their rooms stay where they
// were moved; restoring a type doesn't bring them back.
import { useMutation } from '@tanstack/react-query'
import type { LoweredTonight, RoomTypeView } from '@vento/shared'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { LoweredDialog, loweredFrom } from '@/components/rates/lowered-dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { errorCode, problemMessage } from '@/lib/errors'
import { plural } from './format'
import { useRoomsRefresh } from './queries'

export function ArchivedTypes({
  types,
  canWrite,
}: {
  types: readonly RoomTypeView[]
  canWrite: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm text-text-2 hover:bg-surface-2 sm:px-5 lg:min-h-9"
      >
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
        {plural(types.length, 'removed type')}
      </button>
      {open ? (
        <ul className="divide-y divide-border border-t border-border">
          {types.map((type) => (
            <ArchivedType key={type.id} type={type} canWrite={canWrite} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ArchivedType({ type, canWrite }: { type: RoomTypeView; canWrite: boolean }) {
  const refresh = useRoomsRefresh()
  // After go-live, a type whose prices come back cheaper than earlier today asks why.
  const [lowered, setLowered] = useState<LoweredTonight[]>()
  const [askError, setAskError] = useState<string>()
  const restore = useMutation({
    mutationFn: (reason?: string) =>
      api.roomTypes.restore({ id: type.id, ...(reason ? { reason } : {}) }),
    onSuccess: async () => {
      setLowered(undefined)
      await refresh()
      toast.success(`${type.name} restored`)
    },
    onError: (error) => {
      if (errorCode(error) === 'REASON_REQUIRED') {
        if (lowered) setAskError(problemMessage(error))
        else setLowered(loweredFrom(error))
        return
      }
      toast.error(problemMessage(error))
    },
  })
  return (
    <li className="flex items-center gap-3 px-4 py-2 sm:px-5">
      <span className="min-w-0 grow truncate text-text-2" title={type.name}>
        {type.name} <span className="num text-xs text-text-3">{type.code}</span>
      </span>
      <Button
        size="sm"
        className="max-lg:h-11"
        disabled={!canWrite}
        loading={restore.isPending}
        aria-label={`Restore ${type.name}`}
        onClick={() => restore.mutate(undefined)}
      >
        Restore
      </Button>
      {lowered ? (
        <LoweredDialog
          lowered={lowered}
          confirmLabel={`Restore ${type.name}`}
          pending={restore.isPending}
          error={askError}
          onConfirm={(reason) => restore.mutate(reason)}
          onClose={() => {
            setLowered(undefined)
            setAskError(undefined)
          }}
        />
      ) : null}
    </li>
  )
}
