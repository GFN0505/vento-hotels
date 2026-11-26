// PIN sessions on shared devices (decision 0022): lock after the device's idle time, or at once
// from the Lock button. Locking signs the person out and returns to the lock screen.
import { useEffect } from 'react'
import { toast } from 'sonner'
import { clearSavedData } from '@/offline/saved-data'
import { authClient } from './auth'

export async function lockDevice(firstName?: string) {
  await authClient.signOut()
  // The next person must not open the app as this one, even offline.
  await clearSavedData()
  // A full page load, so nothing from this person stays in memory for the next one.
  window.location.assign(firstName ? `/lock?signedOut=${encodeURIComponent(firstName)}` : '/lock')
}

const WARNING_SECONDS = 10
const PING_EVERY_MS = 30_000
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

// Signs out after `idleSeconds` without a touch, with a 10-second warning and a way to stay.
export function useIdleLock(idleSeconds: number | undefined, firstName: string) {
  useEffect(() => {
    if (!idleSeconds) return
    const warnAfter = Math.max(idleSeconds - WARNING_SECONDS, 0) * 1000
    let warnTimer: ReturnType<typeof setTimeout>
    let lockTimer: ReturnType<typeof setTimeout>
    const start = () => {
      warnTimer = setTimeout(() => {
        toast.warning(`Signing you out in ${WARNING_SECONDS} seconds`, {
          id: 'idle-lock',
          duration: WARNING_SECONDS * 1000,
          action: { label: 'Stay signed in', onClick: reset },
        })
      }, warnAfter)
      lockTimer = setTimeout(() => void lockDevice(firstName), idleSeconds * 1000)
    }
    // The server keeps its own idle clock (it signs out even if this page can't); a light ping
    // while someone is busy keeps the two in step, and an ended session returns to the lock screen.
    let lastPing = Date.now()
    function reset() {
      clearTimeout(warnTimer)
      clearTimeout(lockTimer)
      toast.dismiss('idle-lock')
      start()
      if (Date.now() - lastPing > PING_EVERY_MS) {
        lastPing = Date.now()
        void import('./api').then(({ api }) =>
          api.organization.current().catch((error: unknown) => {
            if ((error as { status?: number }).status === 401) void lockDevice(firstName)
          }),
        )
      }
    }
    start()
    for (const event of ACTIVITY) window.addEventListener(event, reset, { passive: true })
    return () => {
      clearTimeout(warnTimer)
      clearTimeout(lockTimer)
      for (const event of ACTIVITY) window.removeEventListener(event, reset)
    }
  }, [idleSeconds, firstName])
}
