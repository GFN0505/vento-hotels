// Rename a shared device; staff see the name on its lock screen.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeviceView } from '@vento/shared'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'

export function RenameDialog({ device, onClose }: { device: DeviceView; onClose: () => void }) {
  const queryClient = useQueryClient()
  const formId = useId()
  const [name, setName] = useState(device.name)
  const [problem, setProblem] = useState<string>()
  const rename = useMutation({
    mutationFn: () => api.devices.rename({ id: device.id, name: name.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.devices.key() })
      toast.success(`Renamed to ${name.trim()}`)
      onClose()
    },
    onError: (error) => setProblem(problemMessage(error)),
  })
  return (
    <Dialog
      open
      onClose={() => (rename.isPending ? undefined : onClose())}
      title={`Rename ${device.name}`}
      footer={
        <>
          <Button onClick={onClose} disabled={rename.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={rename.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim().length < 2) return setProblem('Enter at least 2 characters')
          rename.mutate()
        }}
      >
        <Field
          label="Name"
          name="name"
          maxLength={40}
          data-autofocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={problem}
        />
      </form>
    </Dialog>
  )
}
