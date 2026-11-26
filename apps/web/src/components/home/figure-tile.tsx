// A key figure whose module hasn't shipped yet (designs: ExecHome and GMHome tiles). It keeps the
// tile's shape and craft, marks where the figure will sit with a quiet dotted baseline (no invented
// trend), and says which module brings it: never a dash or a zero that could pass for data. Opens the
// module's page, which says what the module will do.
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { findModule } from '@/lib/navigation'
import type { Figure } from './role-focus'

export function FigureTile({ figure, index }: { figure: Figure; index: number }) {
  const module = findModule(figure.from)
  const Icon = figure.icon
  return (
    <Link
      to="/$section"
      params={{ section: figure.from.slice(1) }}
      className="group relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-lg border border-border bg-surface p-4 shadow-card transition duration-150 hover:-translate-y-px hover:border-pri-line hover:shadow-[var(--shadow-lg)] motion-safe:animate-[tile-in_320ms_ease-out_both] sm:min-h-[140px] sm:gap-3 sm:p-5"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 flex-none place-items-center rounded-lg bg-pri-soft text-pri-ink">
          <Icon className="size-4" aria-hidden="true" strokeWidth={1.9} />
        </span>
        <span className="grow text-sm font-medium text-text-2">{figure.label}</span>
        <ArrowUpRight
          className="size-4 shrink-0 text-text-3 transition-colors group-hover:text-pri-ink"
          aria-hidden="true"
        />
      </div>
      <span aria-hidden="true" className="flex h-8 items-end">
        <span className="h-0 w-full border-t-2 border-dotted border-pri-line" />
      </span>
      <span className="flex items-center gap-1.5 text-[13px] text-text-2 sm:text-sm">
        <span className="size-1.5 flex-none rounded-full bg-logo-dot" aria-hidden="true" />
        {module ? `Arrives with ${module.label}` : 'Arrives with its module'}
      </span>
    </Link>
  )
}
