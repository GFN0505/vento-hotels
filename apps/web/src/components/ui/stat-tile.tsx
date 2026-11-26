// A key figure (designs: ExecHome tiles; Vento Real Estate's StatCard): a tinted icon, a label,
// the figure large, and a line of context. Linked tiles lift on hover and show an arrow. While the
// figure loads, a skeleton of the same size stands in (never a dash that looks like data).
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const TONES = {
  violet: 'bg-pri-soft text-pri-ink',
  emerald: 'bg-em-bg text-em',
  blue: 'bg-bl-bg text-bl',
  amber: 'bg-am-bg text-am',
  slate: 'bg-sl-bg text-sl',
} as const

type StatTileProps = {
  icon: LucideIcon
  label: string
  value: ReactNode | undefined
  context?: ReactNode
  tone?: keyof typeof TONES
  to?: string
  // Extra content under the figure, e.g. a progress bar.
  children?: ReactNode
  className?: string
}

export function StatTile({
  icon: Icon,
  label,
  value,
  context,
  tone = 'violet',
  to,
  children,
  className,
}: StatTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={cn('grid size-8 flex-none place-items-center rounded-lg', TONES[tone])}>
          <Icon className="size-4" aria-hidden="true" strokeWidth={1.9} />
        </span>
        <span className="grow text-sm font-medium text-text-2">{label}</span>
        {to ? (
          <ArrowUpRight
            className="size-4 text-text-3 transition-colors group-hover:text-pri-ink"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {value === undefined ? (
        <span aria-hidden="true" className="h-7 w-16 animate-pulse rounded-sm bg-surface-2" />
      ) : (
        <span className="num text-[24px] leading-none font-semibold tracking-[-0.02em] sm:text-[28px]">
          {value}
        </span>
      )}
      {context ? <span className="text-[13px] text-text-2 sm:text-sm">{context}</span> : null}
      {children}
    </>
  )
  const classes = cn(
    'group flex min-w-0 flex-col gap-2.5 rounded-lg border border-border bg-surface p-4 shadow-card sm:min-h-[132px] sm:gap-3 sm:p-5',
    'motion-safe:animate-[tile-in_320ms_ease-out_both]',
    to &&
      'transition duration-150 hover:-translate-y-px hover:border-pri-line hover:shadow-[var(--shadow-lg)]',
    className,
  )
  return to ? (
    <Link to={to} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}
