// The top of every page (as in Vento Real Estate): the title, an optional status badge beside it,
// a short description, and the page's one primary action on the right.
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type PageHeaderProps = {
  title: ReactNode
  badge?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, badge, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-2xl">
            {title}
          </h1>
          {badge}
        </div>
        {description ? <p className="mt-1 text-text-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
