// A table that may scroll sideways on a phone: focusable and named, so keyboards can scroll it
// (axe: scrollable-region-focusable).
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs keyboard access.
      tabIndex={0}
      className={cn('focus-visible:outline-2 focus-visible:outline-ring', className)}
    >
      {children}
    </section>
  )
}
