// The devices list (design #25, SetDevices): live first, then revoked (muted), each with when it was
// last used. With All hotels each row names its hotel; with one hotel the eyebrow already does.
import { DEVICE_KINDS, type DeviceView } from '@vento/shared'
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
