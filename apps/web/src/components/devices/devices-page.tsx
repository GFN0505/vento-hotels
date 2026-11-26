// Devices (design #25, SetDevices; decision 0022; spec: stage-1-hotel-switch-scope): the shared
// tablets, PCs and phones staff sign in on with a PIN, for the hotel chosen in the top bar or, with
// All hotels, every hotel. Register this one, rename, or revoke a lost one.
import { useQuery } from '@tanstack/react-query'
import type { DeviceView } from '@vento/shared'
import { MonitorSmartphone, Plus } from 'lucide-react'
import { useState } from 'react'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { keepWithinHotel, scopePropertyId } from '@/lib/scope'
import { useOnline } from '@/offline/connection'
import { DeviceList, DeviceListSkeleton } from './device-list'
import { LockThisDevice } from './lock-this-device'
import { RegisterDialog } from './register-dialog'
import { RenameDialog } from './rename-dialog'
import { RevokeDialog } from './revoke-dialog'

type Props = { register: string | undefined; onRegistered: () => void }

export function DevicesPage({ register, onRegistered }: Props) {
  useScopedTitle('Devices')
  const me = useMe()
  const online = useOnline()
  const { scope } = useProperty()
  const [registering, setRegistering] = useState(Boolean(register))
  const [renaming, setRenaming] = useState<DeviceView>()
  const [revoking, setRevoking] = useState<DeviceView>()
  const propertyId = scopePropertyId(scope)
  const hotel = scope?.kind === 'hotel' ? scope.hotel : undefined
  const list = useQuery({
    ...orpc.devices.list.queryOptions({ input: { propertyId, pageSize: 100 } }),
    enabled: me.can('setup.manage') && scope !== undefined,
    placeholderData: keepWithinHotel(propertyId),
  })
  const lock = useQuery({
    ...orpc.devices.lockScreen.queryOptions(),
    enabled: me.can('setup.manage'),
  })

  if (me.isPending) return null
  if (!me.can('setup.manage')) return <NoAccess what="devices" />
  // Whether this browser is a registered, live device, whichever hotel is chosen.
  const thisOne = lock.data?.status === 'ready' ? lock.data.device : undefined
  const live = list.data?.items.filter((device) => !device.revokedAt).length
  const openRegister = () => setRegistering(true)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Devices"
        description={
          hotel
            ? `Shared tablets, PCs and phones at ${hotel.name} where staff sign in with a 4-digit PIN.`
            : 'Shared tablets, PCs and phones where staff sign in with a 4-digit PIN.'
        }
        actions={
          thisOne ? (
            <LockThisDevice device={thisOne} hotel={hotel} />
          ) : (
            <Button variant="primary" size="lg" className="max-lg:h-11" onClick={openRegister}>
              <Plus className="size-4" aria-hidden="true" />
              Register this device
            </Button>
          )
        }
      />

      {list.isPending || !scope ? (
        <DeviceListSkeleton />
      ) : list.isError ? (
        <Card className="flex flex-col items-start gap-3 p-5" role="alert">
          <p className="font-medium">
            {hotel
              ? `We couldn't load the devices at ${hotel.name}.`
              : "We couldn't load your devices."}
          </p>
          <p className="text-text-2">
            {online
              ? problemMessage(list.error)
              : `Not saved on this device yet. Connect to see ${hotel?.name ?? 'your devices'}.`}
          </p>
          <Button onClick={() => list.refetch()} loading={list.isFetching}>
            Try again
          </Button>
        </Card>
      ) : list.data.items.length === 0 ? (
        // "Register this device" is the page's one primary action, in the header.
        <EmptyState icon={MonitorSmartphone}>
          {hotel ? (
            <>
              <p className="font-medium text-text">No shared devices at {hotel.name} yet</p>
              <p>
                Open Vento on the front desk PC, restaurant tablet or housekeeping phone there, sign
                in, and register it here.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-text">No shared devices yet</p>
              <p>
                Open Vento on the restaurant tablet, front desk PC or housekeeping phone, sign in,
                and register it here. Staff then tap their name and enter their PIN.
              </p>
            </>
          )}
        </EmptyState>
      ) : (
        <section aria-labelledby="devices-heading" className="flex flex-col gap-3">
          <h2 id="devices-heading" className="font-semibold">
            Shared devices <span className="font-normal text-text-3">{live}</span>
          </h2>
          <DeviceList
            devices={list.data.items}
            showHotel={!hotel}
            onRename={setRenaming}
            onRevoke={setRevoking}
          />
        </section>
      )}

      {/* Mounted on opening, so it starts on the hotel in view at that moment. */}
      {registering ? (
        <RegisterDialog
          open
          hotelId={register}
          onClose={() => {
            setRegistering(false)
            if (register) onRegistered()
          }}
        />
      ) : null}
      {renaming ? (
        <RenameDialog key={renaming.id} device={renaming} onClose={() => setRenaming(undefined)} />
      ) : null}
      {revoking ? (
        <RevokeDialog key={revoking.id} device={revoking} onClose={() => setRevoking(undefined)} />
      ) : null}
    </div>
  )
}
