// A calm, full-width card for "nothing here yet": an icon tile, a line or two of copy, and one
// clear next step (as in Vento Real Estate).
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type EmptyStateProps = {
  icon: LucideIcon
  // 'brand' tints the icon tile for page-level empties, so it isn't grey on grey.
  tone?: 'neutral' | 'brand'
  children: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  tone = 'neutral',
  children,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-card sm:py-16',
        className,
      )}
    >
      <span
        className={cn(
          'grid size-12 place-items-center rounded-xl ring-1 ring-border',
          tone === 'brand' ? 'bg-pri-soft text-pri-ink' : 'bg-surface-2 text-text-2',
        )}
      >
        <Icon aria-hidden="true" className="size-6" strokeWidth={1.7} />
      </span>
      <div className="max-w-md text-[14px] leading-relaxed text-text-2">{children}</div>
      {action}
    </div>
  )
}
