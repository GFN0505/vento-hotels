// Hotel pages with "All hotels" chosen (spec: stage-1-hotel-switch-scope): the page only makes sense
// for one hotel, so it asks which. One shared panel; each page gives its own first line ("Rooms are
// set up per hotel. Pick a hotel.") and, optionally, a fact per hotel on the right. Picking one
// selects it in the top bar.
import type { Property } from '@vento/shared'
import { Building2, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { initials } from '@/lib/team'
import { useProperty } from './property-context'

type Props = {
  title: string
  // What this page shows for each hotel, e.g. its room count.
  aside?: (hotel: Property) => ReactNode
}

export function PickHotel({ title, aside }: Props) {
  const { properties, select } = useProperty()
  return (
    <section
      aria-labelledby="pick-heading"
      className="flex flex-col items-center gap-5 rounded-lg border border-border bg-surface px-4 py-10 text-center shadow-card sm:px-6 sm:py-14"
    >
      <span className="grid size-12 place-items-center rounded-xl bg-pri-soft text-pri-ink ring-1 ring-pri-line">
        <Building2 className="size-6" aria-hidden="true" strokeWidth={1.7} />
      </span>
      <div className="flex flex-col gap-1">
        <h2 id="pick-heading" className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-text-2">You can switch hotels any time from the top bar.</p>
      </div>
      <ul className="flex w-full max-w-lg flex-col divide-y divide-border overflow-hidden rounded-md border border-border text-left">
        {properties.map((hotel) => {
          const where = [hotel.area, hotel.state].filter(Boolean).join(', ')
          return (
            <li key={hotel.id}>
              <button
                type="button"
                onClick={() => select(hotel.id)}
                className="group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
              >
                <span
                  aria-hidden="true"
                  className="grid size-10 flex-none place-items-center rounded-lg bg-linear-to-br from-pri-soft to-surface-2 text-xs font-semibold text-pri-ink ring-1 ring-pri-line/60"
                >
                  {initials(hotel.name)}
                </span>
                <span className="flex min-w-0 grow flex-col">
                  <span className="truncate font-semibold" title={hotel.name}>
                    {hotel.name}
                  </span>
                  {where ? <span className="truncate text-sm text-text-2">{where}</span> : null}
                </span>
                {aside?.(hotel)}
                <ChevronRight
                  className="size-4 flex-none text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-pri-ink"
                  aria-hidden="true"
                />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
