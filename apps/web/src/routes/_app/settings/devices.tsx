// Devices (design #25, SetDevices; decision 0022): the shared tablets, PCs and phones staff sign in
// on with a PIN. Register this one, rename, or revoke a lost one.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { DEVICE_KINDS, type DeviceKind, type DeviceView } from '@vento/shared'
import { Lock, MonitorSmartphone, Plus } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { useProperty } from '@/components/shell/property-context'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { lockDevice } from '@/lib/device-session'
import { problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { usePageTitle } from '@/lib/title'

// ?register=<hotel id> opens "Register this device" bound to that hotel (a new hotel's next steps).
export const Route = createFileRoute('/_app/settings/devices')({
  validateSearch: (search: Record<string, unknown>): { register?: string | undefined } =>
    typeof search.register === 'string' && search.register
      ? { register: search.register.slice(0, 40) }
      : {},
  component: DevicesPage,
})

const KIND_OPTIONS = (Object.keys(DEVICE_KINDS) as DeviceKind[]).map((kind) => ({
  value: kind,
  label: DEVICE_KINDS[kind].label,
}))

function lastSeen(iso: string | null): string {
  if (!iso) return 'Not used yet'
  const date = new Date(iso)
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 2) return 'Just now'
  if (minutes < 60) return `${minutes} minutes ago`
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function DevicesPage() {
  usePageTitle('Devices')
  const me = useMe()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [registering, setRegistering] = useState(Boolean(search.register))
  const [renaming, setRenaming] = useState<DeviceView>()
  const [revoking, setRevoking] = useState<DeviceView>()
  const [confirmingLock, setConfirmingLock] = useState(false)
  const list = useQuery({
    ...orpc.devices.list.queryOptions({ input: { pageSize: 100 } }),
    enabled: me.can('setup.manage'),
    placeholderData: keepPreviousData,
  })

  if (me.isPending) return null
  if (!me.can('setup.manage')) return <NoAccess what="devices" />
  const thisOne = list.data?.items.find((d) => d.isThisDevice && !d.revokedAt)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-2xl">
            Devices
          </h1>
          <p className="text-text-2">
            Shared tablets, PCs and phones where staff sign in with a 4-digit PIN.
          </p>
        </div>
        {thisOne ? (
          <Button
            variant="primary"
            size="lg"
            className="max-lg:h-11"
            onClick={() => setConfirmingLock(true)}
          >
            <Lock className="size-4" aria-hidden="true" />
            Lock this device
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="max-lg:h-11"
            onClick={() => setRegistering(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Register this device
          </Button>
        )}
      </header>

      {list.isPending ? (
        <Card aria-busy="true" aria-label="Loading devices" className="flex flex-col gap-2 p-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-10 animate-pulse rounded-sm bg-surface-2" />
          ))}
        </Card>
      ) : list.isError ? (
        <Card className="flex flex-col items-start gap-3 p-5" role="alert">
          <p className="font-medium">We couldn't load your devices.</p>
          <p className="text-text-2">{problemMessage(list.error)}</p>
          <Button onClick={() => list.refetch()}>Try again</Button>
        </Card>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={MonitorSmartphone}>
          <p className="font-medium text-text">No shared devices yet</p>
          <p>
            Open Vento on the restaurant tablet, front desk PC or housekeeping phone, sign in, and
            register it here. Staff then tap their name and enter their PIN.
          </p>
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {list.data.items.map((device) => (
              <li
                key={device.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3',
                  device.revokedAt && 'opacity-70',
                )}
              >
                <div className="flex min-w-0 grow basis-60 flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="truncate">{device.name}</span>
                    {device.isThisDevice ? (
                      <span className="rounded-full bg-pri-soft px-2 text-xs text-pri-ink">
                        This device
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm text-text-2">
                    {DEVICE_KINDS[device.kind].label} · {device.propertyName}
                  </span>
                </div>
                <span className="text-sm whitespace-nowrap text-text-3">
                  {device.revokedAt ? (
                    <span className="text-ro">
                      Revoked {lastSeen(device.revokedAt).toLowerCase()}
                      {device.revokedReason ? `: ${device.revokedReason}` : ''}
                    </span>
                  ) : (
                    `Last used ${lastSeen(device.lastSeenAt).toLowerCase()}`
                  )}
                </span>
                {device.revokedAt ? null : (
                  <div className="flex gap-3">
                    <Button
                      size="sm"
                      className="max-lg:h-11"
                      onClick={() => setRenaming(device)}
                      aria-label={`Rename ${device.name}`}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-ro max-lg:h-11"
                      onClick={() => setRevoking(device)}
                      aria-label={`Revoke ${device.name}`}
                    >
                      Revoke
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RegisterDialog
        open={registering}
        hotelId={search.register}
        onClose={() => {
          setRegistering(false)
          if (search.register) void navigate({ search: {} })
        }}
      />
      <Dialog
        open={confirmingLock}
        onClose={() => setConfirmingLock(false)}
        title="Lock this device?"
        description="You'll be signed out here, and staff sign in on this device with their PIN."
        footer={
          <>
            <Button onClick={() => setConfirmingLock(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void lockDevice()}>
              Lock this device
            </Button>
          </>
        }
      >
        <p className="text-text-2">To manage settings again, sign in with your email.</p>
      </Dialog>
      {renaming ? (
        <RenameDialog key={renaming.id} device={renaming} onClose={() => setRenaming(undefined)} />
      ) : null}
      {revoking ? (
        <RevokeDialog key={revoking.id} device={revoking} onClose={() => setRevoking(undefined)} />
      ) : null}
    </div>
  )
}

function RegisterDialog({
  open,
  hotelId,
  onClose,
}: {
  open: boolean
  hotelId?: string | undefined
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { properties, current } = useProperty()
  const formId = useId()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<DeviceKind>('pos')
  const [propertyId, setPropertyId] = useState(
    properties.find((p) => p.id === hotelId)?.id ?? current?.id ?? properties[0]?.id ?? '',
  )
  const [problem, setProblem] = useState<{ name?: string | undefined; form?: string | undefined }>(
    {},
  )
  const [registered, setRegistered] = useState<DeviceView>()

  const register = useMutation({
    mutationFn: () => api.devices.register({ name: name.trim(), kind, propertyId }),
    onSuccess: async (device) => {
      await queryClient.invalidateQueries({ queryKey: orpc.devices.key() })
      setRegistered(device)
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
    if (name.trim().length < 2) {
      setProblem({ name: 'Give it a name staff will recognise, e.g. POS-VI-03' })
      ;(event.currentTarget.elements.namedItem('name') as HTMLInputElement | null)?.focus()
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
          It signs people out after{' '}
          {DEVICE_KINDS[registered.kind].idleSeconds < 120
            ? `${DEVICE_KINDS[registered.kind].idleSeconds} seconds`
            : `${DEVICE_KINDS[registered.kind].idleSeconds / 60} minutes`}{' '}
          without a touch.
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
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
          />
        ) : null}
      </form>
    </Dialog>
  )
}

function RenameDialog({ device, onClose }: { device: DeviceView; onClose: () => void }) {
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

function RevokeDialog({ device, onClose }: { device: DeviceView; onClose: () => void }) {
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
