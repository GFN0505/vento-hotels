// "Your workspace" (as in Vento Real Estate): every module this person uses, as a card with its
// icon and a few words. A cyan dot marks modules still opening; the card opens the module's page.
import { Link } from '@tanstack/react-router'
import type { NavGroup } from '@/lib/navigation'

export function Workspace({ groups }: { groups: NavGroup[] }) {
  const entries = groups.flatMap((group) => group.entries)
  if (entries.length === 0) return null
  return (
    <section aria-labelledby="workspace-heading" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h2 id="workspace-heading" className="text-lg font-semibold tracking-[-0.01em]">
          Your workspace
        </h2>
        <span className="flex items-center gap-2 text-sm text-text-2">
          <span className="size-2 rounded-full bg-logo-dot" aria-hidden="true" />
          Opening soon
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {entries.map((entry) => {
          const Icon = entry.icon
          return (
            <li key={entry.to}>
              <Link
                to="/$section"
                params={{ section: entry.to.slice(1) }}
                className="group flex h-full items-center gap-4 rounded-lg border border-border bg-surface p-4 shadow-card transition duration-150 hover:-translate-y-px hover:border-pri-line hover:shadow-[var(--shadow-lg)] sm:p-5"
              >
                <span className="grid size-12 flex-none place-items-center rounded-xl bg-pri-soft text-pri-ink transition-transform group-hover:scale-105">
                  <Icon className="size-[22px]" aria-hidden="true" strokeWidth={1.7} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2 font-semibold text-text">
                    {entry.label}
                    <span className="size-1.5 rounded-full bg-logo-dot" aria-hidden="true" />
                    <span className="sr-only">(opening soon)</span>
                  </span>
                  <span className="text-sm text-text-2">{entry.tagline}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
