// Register this device (design #25, SetDevices): name, what it's for and which hotel. The hotel
// starts on the one chosen in the top bar; with All hotels it starts empty and must be chosen, so a
// tablet in Abuja is never bound to whichever hotel was picked last. Registering at another hotel
// moves the top bar there: this browser is now that hotel's device.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeviceKind, DeviceView } from '@vento/shared'
import { Lock } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { useProperty } from '@/components/shell/property-context'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { api, orpc } from '@/lib/api'
import { lockDevice } from '@/lib/device-session'
import { problemMessage } from '@/lib/errors'
import { idleTime, KIND_OPTIONS } from './format'

type Props = {
  open: boolean
  // From ?register=<id> (a new hotel's next steps): wins over the top bar.
  hotelId?: string | undefined
  onClose: () => void
}

type Problems = { name?: string | undefined; hotel?: string | undefined; form?: string | undefined }

export function RegisterDialog({ open, hotelId, onClose }: Props) {
  const queryClient = useQueryClient()
  const { properties, scope, select } = useProperty()
  const formId = useId()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<DeviceKind>('pos')
  const [propertyId, setPropertyId] = useState(
    properties.find((p) => p.id === hotelId)?.id ??
      (scope?.kind === 'hotel'
        ? scope.hotel.id
        : properties.length === 1
          ? properties[0]?.id
          : '') ??
      '',
  )
  const [problem, setProblem] = useState<Problems>({})
  const [registered, setRegistered] = useState<DeviceView>()

  const register = useMutation({
    mutationFn: () => api.devices.register({ name: name.trim(), kind, propertyId }),
    onSuccess: async (device) => {
      await queryClient.invalidateQueries({ queryKey: orpc.devices.key() })
      setRegistered(device)
      if (scope?.kind !== 'hotel' || scope.hotel.id !== device.propertyId) {
        select(device.propertyId)
        toast.success(`${device.name} registered at ${device.propertyName}`)
      }
    },
    onError: (error) => setProblem({ form: problemMessage(error) }),
  })

  function close() {
    setName('')
    setProblem({})
    setRegistered(undefined)
    onClose()
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: Problems = {
      name:
        name.trim().length < 2 ? 'Give it a name staff will recognise, e.g. POS-VI-03' : undefined,
      hotel: propertyId ? undefined : 'Choose the hotel this device is at',
    }
    setProblem(found)
    const first = found.name ? 'name' : found.hotel ? 'hotel' : undefined
    if (first) {
      ;(event.currentTarget.elements.namedItem(first) as HTMLElement | null)?.focus()
      return
    }
    register.mutate()
  }

  if (registered) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title={`${registered.name} is registered`}
        description={`Lock it now, and staff at ${registered.propertyName} sign in with their PIN. People without a PIN set one from their account menu.`}
        footer={
          <>
            <Button onClick={close}>Done</Button>
            <Button variant="primary" onClick={() => void lockDevice()}>
              <Lock className="size-4" aria-hidden="true" />
              Lock this device
            </Button>
          </>
        }
      >
        <p className="text-text-2">
          It signs people out after {idleTime(registered.kind)} without a touch.
        </p>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={() => (register.isPending ? undefined : close())}
      title="Register this device"
      description="Do this on the device itself, signed in as a manager."
      footer={
        <>
          <Button onClick={close} disabled={register.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={register.isPending}>
            Register
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {problem.form ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problem.form}
          </p>
        ) : null}
        <Field
          label="Name"
          name="name"
          placeholder="e.g. POS-VI-03"
          maxLength={40}
          data-autofocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          hint="Staff see this on the lock screen. Many hotels label the device with it too."
          error={problem.name}
        />
        <SelectField
          label="What it's for"
          value={kind}
          onChange={(event) => setKind(event.target.value as DeviceKind)}
          options={KIND_OPTIONS}
        />
        {properties.length > 1 ? (
          <SelectField
            label="Hotel"
            name="hotel"
            required
            value={propertyId}
            {...(propertyId ? {} : { placeholder: 'Choose a hotel' })}
            onChange={(event) => setPropertyId(event.target.value)}
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            error={problem.hotel}
          />
        ) : null}
      </form>
    </Dialog>
  )
}
