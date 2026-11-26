// Archive and restore a company (spec: "Company rules"). Archiving only works when it owns no active
// hotel, so the button explains what to move first instead of failing after a click.
import { useMutation } from '@tanstack/react-query'
import type { Entity } from '@vento/shared'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { useSetupRefresh } from '@/components/hotels/queries'
import { Button } from '@/components/ui/button'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { hotelsLine } from './company-form-model'

export function ownsHotelsMessage(company: Entity): string | undefined {
  const count = company.hotels.length + company.otherHotels
  if (count === 0) return undefined
  const what = count === 1 ? '1 hotel' : `${count} hotels`
  return `${company.name} owns ${what} (${hotelsLine(company)}). Move ${count === 1 ? 'it' : 'them'} to another company first.`
}

export function ArchiveCompany({ company, onDone }: { company: Entity; onDone: () => void }) {
  const noteId = useId()
  const online = useOnline()
  const refresh = useSetupRefresh()
  const [asking, setAsking] = useState(false)
  const blocked = ownsHotelsMessage(company)
  const archive = useMutation({
    mutationFn: (reason: string) => api.entities.archive({ id: company.id, reason }),
    onSuccess: async (archived) => {
      await refresh()
      toast.success(`${archived.name} archived`)
      setAsking(false)
      onDone()
    },
  })
  return (
    <section
      aria-labelledby={`${noteId}-title`}
      className="mt-6 flex flex-col items-start gap-2 rounded-lg border border-ro-dot/40 p-4"
    >
      <h3 id={`${noteId}-title`} className="font-semibold text-ro">
        Archive company
      </h3>
      <p id={noteId} className="text-sm text-text-2">
        {blocked ??
          'It leaves the owning-company picker. Its history is kept, and you can restore it.'}
      </p>
      <Button
        variant="danger"
        className="max-lg:h-11"
        disabled={!online || Boolean(blocked)}
        aria-describedby={noteId}
        onClick={() => setAsking(true)}
      >
        Archive company
      </Button>
      <ReasonDialog
        open={asking}
        title={`Archive ${company.name}?`}
        description="It leaves the owning-company picker. Its history is kept, and you can restore it."
        label="Reason for archiving"
        confirmLabel={`Archive ${company.name}`}
        destructive
        pending={archive.isPending}
        error={archive.error ? problemMessage(archive.error) : undefined}
        onConfirm={(reason) => archive.mutate(reason)}
        onClose={() => {
          archive.reset()
          setAsking(false)
        }}
      />
    </section>
  )
}

export function RestoreCompany({ company, onClose }: { company: Entity; onClose: () => void }) {
  const refresh = useSetupRefresh()
  const restore = useMutation({
    mutationFn: (reason: string) => api.entities.restore({ id: company.id, reason }),
    onSuccess: async (restored) => {
      await refresh()
      toast.success(`${restored.name} restored`)
      onClose()
    },
  })
  return (
    <ReasonDialog
      open
      title={`Restore ${company.name}?`}
      description="It comes back to the owning-company picker."
      label="Reason for restoring"
      confirmLabel={`Restore ${company.name}`}
      pending={restore.isPending}
      error={restore.error ? problemMessage(restore.error) : undefined}
      onConfirm={(reason) => restore.mutate(reason)}
      onClose={onClose}
    />
  )
}
