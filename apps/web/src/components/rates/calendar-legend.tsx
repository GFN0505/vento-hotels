// The calendar's key: written out on wide screens; behind a "Key" button on phones and tablets,
// where the first prices matter more than the explanation.
import { Info, Link2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

function Items({ className }: { className?: string }) {
  return (
    <ul className={cn('flex text-sm text-text-3', className)}>
      <li className="inline-flex items-center gap-1">
        <Link2 className="size-3.5" aria-hidden="true" /> derived plan, edit its parent
      </li>
      <li>MIN = minimum stay</li>
      <li>CTA = closed to arrival</li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-pri" /> price set for that date
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-weekend ring-1 ring-border" />
        Fri and Sat
      </li>
    </ul>
  )
}

export function CalendarLegend({ compact }: { compact: boolean }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  if (!compact) return <Items className="flex-wrap gap-x-4 gap-y-1" />
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-medium text-text-2 hover:bg-surface-2"
      >
        <Info className="size-4" aria-hidden="true" />
        Key
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-border bg-surface p-3 shadow-[var(--shadow-lg)]">
          <Items className="flex-col gap-2" />
        </div>
      ) : null}
    </div>
  )
}
