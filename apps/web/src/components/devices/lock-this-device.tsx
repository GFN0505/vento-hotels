// "Lock this device" whenever this browser is a registered, live device (read from the lock screen,
// not the hotel's list), with which hotel it belongs to when that's not the one in view.
import type { LockScreen } from '@vento/shared'
import { Lock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { lockDevice } from '@/lib/device-session'

type Device = Extract<LockScreen, { status: 'ready' }>['device']

export function LockThisDevice({
  device,
  hotel,
}: {
  device: Device
  hotel: { name: string } | undefined
}) {
  const [confirming, setConfirming] = useState(false)
  const elsewhere = hotel && hotel.name !== device.propertyName
  return (
    <span className="flex flex-wrap items-center gap-3">
      {elsewhere ? (
        <span className="text-sm text-text-2">Registered at {device.propertyName}</span>
      ) : null}
      <Button
        variant="primary"
        size="lg"
        className="max-lg:h-11"
        onClick={() => setConfirming(true)}
      >
        <Lock className="size-4" aria-hidden="true" />
        Lock this device
      </Button>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Lock this device?"
        description="You'll be signed out here, and staff sign in on this device with their PIN."
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void lockDevice()}>
              Lock this device
            </Button>
          </>
        }
      >
        <p className="text-text-2">To manage settings again, sign in with your email.</p>
      </Dialog>
    </span>
  )
}
