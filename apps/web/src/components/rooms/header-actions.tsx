// The Rooms header's actions: both buttons on wider screens; on phones the primary one plus a
// More menu, so the header stays one line.
import { MoreHorizontal, Plus, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { NEEDS_CONNECTION } from './format'

type Props = {
  online: boolean
  onBuilder: () => void
  onAddType: () => void
  onAddRoom: () => void
}

export function HeaderActions({ online, onBuilder, onAddType, onAddRoom }: Props) {
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item =
    'flex h-11 w-full items-center px-3 text-left font-medium hover:bg-surface-2 disabled:opacity-45'
  return (
    <>
      {!online ? (
        <span className="inline-flex items-center gap-1.5 self-center text-sm text-text-3">
          <WifiOff className="size-4" aria-hidden="true" />
          {NEEDS_CONNECTION}
        </span>
      ) : null}
      <Button
        size="lg"
        className="max-sm:hidden max-lg:h-11"
        disabled={!online}
        onClick={onBuilder}
      >
        Add rooms by floor
      </Button>
      <Button
        size="lg"
        variant="primary"
        className="max-lg:h-11"
        disabled={!online}
        onClick={onAddType}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add room type
      </Button>
      <div ref={menu} className="relative sm:hidden">
        <Button
          size="icon"
          aria-label="More actions"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
        {open ? (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-[var(--shadow-lg)]"
          >
            <button
              type="button"
              role="menuitem"
              className={item}
              disabled={!online}
              onClick={() => {
                setOpen(false)
                onBuilder()
              }}
            >
              Add rooms by floor
            </button>
            <button
              type="button"
              role="menuitem"
              className={item}
              disabled={!online}
              onClick={() => {
                setOpen(false)
                onAddRoom()
              }}
            >
              Add room
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}
