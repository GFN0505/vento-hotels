// "Discard changes to Kora Victoria Island?" when leaving hotel settings with unsaved changes:
// another page, another hotel in the top bar, or closing the tab (spec: "Hotel settings").
import { useBlocker } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { type LeaveGuard, useLeaveGuard } from '@/components/shell/property-context'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

export function LeaveConfirm({
  dirty,
  name,
  onDiscard,
}: {
  dirty: boolean
  name: string
  onDiscard: () => void
}) {
  const blocker = useBlocker({
    // Only leaving the page: opening a sheet on it (search params) keeps the edits on screen.
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
    onDiscard()
    if (blocker.status === 'blocked') blocker.proceed()
    switching?.()
    setSwitching(undefined)
  }
  return (
    <Dialog
      open={open}
      onClose={stay}
      title={`Discard changes to ${name}?`}
      description="Your changes haven't been saved."
      footer={
        <>
          <Button onClick={stay} data-autofocus>
            Keep editing
          </Button>
          <Button variant="danger" onClick={leave}>
            Discard changes
          </Button>
        </>
      }
    >
      <p className="text-text-2">Save them first if you want to keep them.</p>
    </Dialog>
  )
}
