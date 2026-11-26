// Dialog on the native <dialog> element (see use-modal.ts): focus trapped, Esc closes, focus goes
// back to the opener. No library, nothing extra to load.
import { X } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { cn } from '@/lib/cn'
import { useModal } from './use-modal'

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const modal = useModal(open, onClose)
  const titleId = useId()
  const descriptionId = useId()

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes it natively; the click is only for the backdrop.
    <dialog
      ref={modal.ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={modal.onClose}
      onCancel={modal.onCancel}
      onClick={modal.onClick}
      className={cn(
        // The dialog is the column: header and footer stay put, only the middle scrolls.
        'm-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[520px] flex-col overflow-hidden rounded-md border border-border bg-surface p-0 text-text shadow-[var(--shadow-lg)] open:flex',
        'backdrop:bg-[var(--overlay)]',
        'max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none',
        className,
      )}
    >
      {open ? (
        <>
          <header className="flex flex-none items-start gap-3 border-b border-border px-5 py-4">
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <h2 id={titleId} className="text-md font-semibold">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-text-2">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-2 grid size-11 flex-none place-items-center rounded-sm text-text-3 hover:bg-surface-2 hover:text-text lg:size-8"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3 max-lg:[&_button]:h-11 max-sm:flex-col-reverse max-sm:items-stretch">
              {footer}
            </footer>
          ) : null}
        </>
      ) : null}
    </dialog>
  )
}
