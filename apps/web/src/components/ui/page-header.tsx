// The top of every page (as in Vento Real Estate): the scope eyebrow (which hotel, All hotels or
// Whole group; spec: stage-1-hotel-switch-scope), the title, an optional status badge beside it, a
// short description, and the page's one primary action on the right.
import { Building2, Globe, Layers } from 'lucide-react'
import type { ReactNode } from 'react'
import { useOptionalProperty } from '@/components/shell/property-context'
import { cn } from '@/lib/cn'

type PageHeaderProps = {
  title: ReactNode
  badge?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  // 'page' follows the hotel switch; 'group-wide' pages are the same whatever is chosen; 'none'
  // when the title already names the hotel (a hotel's own settings).
  scope?: 'page' | 'group-wide' | 'none'
}

export function PageHeader({
  title,
  badge,
  description,
  actions,
  className,
  scope = 'page',
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0 max-w-full">
        {scope === 'none' ? null : <ScopeEyebrow groupWide={scope === 'group-wide'} />}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Focusable so screen readers can be brought to the page's title after navigating. */}
          <h1
            tabIndex={-1}
            className="text-[22px] leading-tight font-semibold tracking-[-0.02em] focus:outline-none sm:text-[24px]"
          >
            {title}
          </h1>
          {badge}
        </div>
        {description ? <p className="mt-1 break-words text-text-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

// Which hotel the page is about, on its own line above the title. Long names truncate, with the
// full name on hover; the line keeps its height while the hotels load, so nothing jumps.
function ScopeEyebrow({ groupWide }: { groupWide: boolean }) {
  const property = useOptionalProperty()
  if (!property) return null
  const { scope } = property
  const [Icon, label] = groupWide
    ? [Globe, 'Whole group']
    : scope?.kind === 'all'
      ? [Layers, 'All hotels']
      : scope
        ? [Building2, scope.hotel.name]
        : [undefined, undefined]
  return (
    <p className="mb-1 flex h-5 min-w-0 items-center gap-1.5 text-sm font-medium text-text-2">
      {Icon ? <Icon className="size-3.5 flex-none text-text-3" aria-hidden="true" /> : null}
      {label ? (
        <span className="truncate" title={label}>
          {label}
        </span>
      ) : (
        <span className="h-3 w-28 animate-pulse rounded-sm bg-surface-2" aria-hidden="true" />
      )}
    </p>
  )
}
