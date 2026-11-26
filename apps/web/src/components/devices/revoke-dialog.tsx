// Revoke a lost or retired device, with a reason for the audit log. Everyone on it is signed out.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeviceView } from '@vento/shared'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'

export function RevokeDialog({ device, onClose }: { device: DeviceView; onClose: () => void }) {
  const queryClient = useQueryClient()
  const formId = useId()
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string>()
  const revoke = useMutation({
    mutationFn: () => api.devices.revoke({ id: device.id, reason: reason.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.devices.key() })
      toast.success(`${device.name} revoked`)
      onClose()
    },
    onError: (error) => setProblem(problemMessage(error)),
  })
  return (
    <Dialog
      open
      onClose={() => (revoke.isPending ? undefined : onClose())}
      title={`Revoke ${device.name}?`}
      description="Everyone on it is signed out at once, and its lock screen stops working. You can register it again later."
      footer={
        <>
          <Button onClick={onClose} disabled={revoke.isPending}>
            Keep it
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="danger"
            className="border-ro-dot"
            loading={revoke.isPending}
          >
            Revoke {device.name}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (reason.trim().length < 3) return setProblem('Say why, e.g. "Tablet lost on 19 Nov"')
          revoke.mutate()
        }}
      >
        <Field
          label="Reason"
          name="reason"
          maxLength={500}
          data-autofocus
          placeholder="e.g. Tablet lost on 19 Nov"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="Recorded in the audit log with your name."
          error={problem}
        />
      </form>
    </Dialog>
  )
}
