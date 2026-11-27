// Side sheet for multi-field edits (design system: "a side sheet for multi-field edits"): slides in
// from the right on wider screens and fills the screen on phones. Same native <dialog> behaviour as
// Dialog (use-modal.ts); the header and footer stay put and only the middle scrolls.
import { X } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { cn } from '@/lib/cn'
import { useModal } from './use-modal'

type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  // md for a record, lg for a builder with a preview, xl for a flow with steps and a summary.
  size?: 'md' | 'lg' | 'xl'
  // The middle without its padding, for layouts with their own columns.
  bare?: boolean
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  bare = false,
}: SheetProps) {
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
        'sheet fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col overflow-hidden border-border bg-surface p-0 text-text open:flex',
        'md:left-auto md:border-l md:shadow-[var(--shadow-lg)]',
        size === 'xl'
          ? 'md:w-[min(1060px,100vw-48px)]'
          : size === 'lg'
            ? 'md:w-[min(960px,100vw-48px)]'
            : 'md:w-[480px]',
        'backdrop:bg-[var(--overlay)]',
      )}
    >
      {open ? (
        <>
          <header className="flex flex-none items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="flex min-w-0 grow flex-col gap-0.5">
              <h2 id={titleId} className="text-lg font-semibold tracking-[-0.01em] break-words">
                {title}
              </h2>
              {description ? (
                <div id={descriptionId} className="text-text-2">
                  {description}
                </div>
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
          {/* Focusable, so a long sheet scrolls by keyboard even when nothing in view takes focus. */}
          <section
            aria-labelledby={titleId}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs keyboard access.
            tabIndex={0}
            className={cn(
              'min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
              !bare && 'px-5 py-5 sm:px-6',
            )}
          >
            {children}
          </section>
          {footer ? (
            <footer className="flex flex-none flex-wrap items-center gap-2 border-t border-border bg-surface px-5 py-3 sm:px-6 max-lg:[&_button]:h-11">
              {footer}
            </footer>
          ) : null}
        </>
      ) : null}
    </dialog>
  )
}
