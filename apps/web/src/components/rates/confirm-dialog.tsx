// A confirm with consequences (ux-writing rule 4): the title asks, the body explains, the button
// repeats the action.
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

type Props = {
  title: string
  confirmLabel: string
  pending?: boolean
  destructive?: boolean
  error?: string | undefined
  children: ReactNode
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  title,
  confirmLabel,
  pending = false,
  destructive,
  error,
  children,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Dialog
      open
      title={title}
      onClose={() => {
        if (!pending) onClose()
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={pending}
            onClick={onConfirm}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-text-2">
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        {children}
      </div>
    </Dialog>
  )
}
