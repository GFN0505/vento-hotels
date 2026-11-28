// A small card anchored to what opened it (design: the tape chart's `.pop`): the bar card, the room
// menu and the drag popovers. Placed below the anchor (above when there's no room), kept inside the
// window; Escape or a click outside closes it and focus goes back to the opener.
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export type Anchor = { left: number; top: number; bottom: number; right: number }

export const anchorOf = (element: Element | null): Anchor => {
  const rect = element?.getBoundingClientRect()
  return rect
    ? { left: rect.left, top: rect.top, bottom: rect.bottom, right: rect.right }
    : { left: 16, top: 80, bottom: 80, right: 16 }
}

type Props = {
  anchor: Anchor
  label: string
  onClose: () => void
  children: ReactNode
  className?: string
}

const GAP = 6
const EDGE = 12

export function Popover({ anchor, label, onClose, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const below = anchor.bottom + GAP
    const top =
      below + box.height > window.innerHeight - EDGE
        ? Math.max(EDGE, anchor.top - GAP - box.height)
        : below
    const left = Math.min(Math.max(EDGE, anchor.left), window.innerWidth - box.width - EDGE)
    setPlace({ left, top })
  }, [anchor])

  useEffect(() => {
    opener.current = document.activeElement
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], button, a, input')
    first?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
      if (opener.current instanceof HTMLElement && document.contains(opener.current)) {
        opener.current.focus()
      }
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={place ?? { left: anchor.left, top: anchor.bottom + GAP, visibility: 'hidden' }}
      className={cn(
        'fixed z-40 flex w-[min(360px,calc(100vw-24px))] flex-col gap-3 rounded-md border border-border bg-surface p-4 text-text shadow-[var(--shadow-lg)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
