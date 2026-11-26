// The behaviour shared by Dialog and Sheet, on the native <dialog> element: the browser traps
// focus, closes on Esc and makes the page behind inert; this opens it, focuses the right control,
// returns focus to whatever opened it, and tells real dismissals apart from leaving the page.
import { type MouseEvent, type SyntheticEvent, useEffect, useRef } from 'react'

export function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  // Set when the dialog closes because it's leaving the page (or React re-runs effects in
  // development), so that close isn't mistaken for the person dismissing it.
  const silentClose = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !open) return
    // Remember what opened it, so focus goes back there however the dialog ends: closed, or
    // removed from the page by its parent.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    // Opening focuses the first control (Close). A field marked data-autofocus takes it instead,
    // so people can start working straight away.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      if (dialog.open) {
        silentClose.current = true
        dialog.close()
      }
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  return {
    ref,
    onClose: () => {
      if (silentClose.current) {
        silentClose.current = false
        return
      }
      onClose()
    },
    onCancel: (event: SyntheticEvent) => {
      event.preventDefault()
      onClose()
    },
    // A click on the dimmed backdrop lands on the <dialog> itself, never on its contents.
    onClick: (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) onClose()
    },
  }
}
