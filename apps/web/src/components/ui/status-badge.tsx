// A dot and a label on a soft tint, never colour alone (design system: status colours).
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const TONES = {
  emerald: { badge: 'bg-em-bg text-em', dot: 'bg-em-dot' },
  amber: { badge: 'bg-am-bg text-am', dot: 'bg-am-dot' },
  blue: { badge: 'bg-bl-bg text-bl', dot: 'bg-bl-dot' },
  rose: { badge: 'bg-ro-bg text-ro', dot: 'bg-ro-dot' },
  slate: { badge: 'bg-sl-bg text-sl', dot: 'bg-sl-dot' },
} as const

export function StatusBadge({
  tone = 'slate',
  children,
  className,
}: {
  tone?: keyof typeof TONES
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap',
        TONES[tone].badge,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', TONES[tone].dot)} />
      {children}
    </span>
  )
}
