// Restore an archived hotel (spec: "Restore a hotel"): it comes back with its rooms and people's
// access; devices stay revoked. If its company was archived meanwhile, choose an active one first.
import { useMutation } from '@tanstack/react-query'
import type { Property } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { SelectField } from '@/components/ui/select-field'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { defaultCompany } from './company-select'
import { useActiveCompanies, useSetupRefresh } from './queries'

export function RestoreHotel({ hotel, onClose }: { hotel: Property; onClose: () => void }) {
  const refresh = useSetupRefresh()
  const companies = useActiveCompanies()
  const active = companies.data?.items ?? []
  const companyGone = companies.isSuccess && !active.some((c) => c.id === hotel.entityId)
  const [entityId, setEntityId] = useState('')
  const chosen = entityId || defaultCompany(active)
  const restore = useMutation({
    mutationFn: (reason: string) =>
      api.properties.restore({
        id: hotel.id,
        reason,
        ...(companyGone ? { entityId: chosen } : {}),
      }),
    onSuccess: async (restored) => {
      await refresh()
      toast.success(`${restored.name} restored`)
      onClose()
    },
  })
  return (
    <ReasonDialog
      open
      title={`Restore ${hotel.name}?`}
      description="It comes back to the hotel switch with its rooms and people's access. Its devices stay revoked; register them again."
      label="Reason for restoring"
      confirmLabel={`Restore ${hotel.name}`}
      pending={restore.isPending}
      error={restore.error ? problemMessage(restore.error) : undefined}
      onConfirm={(reason) => restore.mutate(reason)}
      onClose={onClose}
    >
      {companyGone ? (
        <SelectField
          label="Owning company"
          value={chosen}
          options={active.map((c) => ({ value: c.id, label: c.name }))}
          hint={`${hotel.entityName} was archived. Choose the company that owns it now.`}
          onChange={(event) => setEntityId(event.target.value)}
        />
      ) : null}
    </ReasonDialog>
  )
}
