// "Discard your count? Nothing has been submitted." when leaving with a count typed: another
// page, another hotel in the top bar, or closing the tab. The count lives only on this screen.
import { useBlocker } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { type LeaveGuard, useLeaveGuard } from '@/components/shell/property-context'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

export function CountLeaveGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirty && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  })
  const [switching, setSwitching] = useState<() => void>()
  const guard: LeaveGuard = useCallback((proceed) => setSwitching(() => proceed), [])
  useLeaveGuard(dirty ? guard : undefined)
  const open = blocker.status === 'blocked' || Boolean(switching)
  const stay = () => {
    if (blocker.status === 'blocked') blocker.reset()
    setSwitching(undefined)
  }
  const leave = () => {
    if (blocker.status === 'blocked') blocker.proceed()
    switching?.()
    setSwitching(undefined)
  }
  return (
    <Dialog
      open={open}
      onClose={stay}
      title="Discard your count?"
      description="Nothing has been submitted."
      footer={
        <>
          <Button onClick={stay} data-autofocus>
            Keep counting
          </Button>
          <Button variant="danger" onClick={leave}>
            Discard count
          </Button>
        </>
      }
    >
      <p className="text-text-2">You'll count again from the start.</p>
    </Dialog>
  )
}
