// The devices list (design #25, SetDevices): live first, then revoked (muted), each with when it was
// last used. With All hotels each row names its hotel; with one hotel the eyebrow already does.
import { Link } from '@tanstack/react-router'
import { DEVICE_KINDS, type DeviceView, type Property } from '@vento/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { lastSeen } from './format'

type Props = {
  devices: DeviceView[]
  showHotel: boolean
  onRename: (device: DeviceView) => void
  onRevoke: (device: DeviceView) => void
}

export function DeviceList({ devices, showHotel, onRename, onRevoke }: Props) {
  return (
    <Card>
      <ul className="divide-y divide-border">
        {devices.map((device) => (
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
                  <span className="flex-none rounded-full bg-pri-soft px-2 text-xs text-pri-ink">
                    This device
                  </span>
                ) : null}
              </span>
              <span className="truncate text-sm text-text-2">
                {DEVICE_KINDS[device.kind].label}
                {showHotel ? ` · ${device.propertyName}` : ''}
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
                  onClick={() => onRename(device)}
                  aria-label={`Rename ${device.name}`}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-ro max-lg:h-11"
                  onClick={() => onRevoke(device)}
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
  )
}

export function DeviceListSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading devices" className="flex flex-col gap-2 p-4">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-10 animate-pulse rounded-sm bg-surface-2" />
      ))}
    </Card>
  )
}

// All hotels: one block per hotel with its live count, then one line for hotels with none yet,
// each a link that opens Register this device for that hotel.
export function DevicesByHotel({
  devices,
  hotels,
  onRename,
  onRevoke,
}: {
  devices: DeviceView[]
  hotels: readonly Pick<Property, 'id' | 'name'>[]
  onRename: (device: DeviceView) => void
  onRevoke: (device: DeviceView) => void
}) {
  const byHotel = hotels
    .map((hotel) => ({ hotel, devices: devices.filter((d) => d.propertyId === hotel.id) }))
    .filter((group) => group.devices.length > 0)
  const without = hotels.filter((hotel) => !devices.some((d) => d.propertyId === hotel.id))
  return (
    <div className="flex flex-col gap-5">
      {byHotel.map(({ hotel, devices: rows }) => (
        <section
          key={hotel.id}
          aria-labelledby={`hotel-${hotel.id}`}
          className="flex flex-col gap-2"
        >
          <h3 id={`hotel-${hotel.id}`} className="text-sm font-semibold text-text-2">
            {hotel.name}{' '}
            <span className="font-normal text-text-3">
              {rows.filter((d) => !d.revokedAt).length}
            </span>
          </h3>
          <DeviceList devices={rows} showHotel={false} onRename={onRename} onRevoke={onRevoke} />
        </section>
      ))}
      {without.length > 0 ? (
        <p className="rounded-md border border-dashed border-border-strong px-4 py-3 text-text-2">
          {'No devices yet at '}
          {without.map((hotel, index) => (
            <span key={hotel.id}>
              <Link
                to="/settings/devices"
                search={{ hotel: hotel.id, register: hotel.id }}
                className="font-medium whitespace-nowrap text-pri-ink underline underline-offset-2"
              >
                {hotel.name}
              </Link>
              {index < without.length - 2 ? ', ' : index === without.length - 2 ? ' and ' : '.'}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  )
}
