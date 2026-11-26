// "Next steps for Kora Lekki" (spec: "Add a hotel: what happens"): rooms, team and devices for a
// hotel this person just added. Each step ticks when done; the card goes once all are done or it's
// dismissed. Rooms shows only for people who set up rooms.
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Property } from '@vento/shared'
import { Check, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useMe } from '@/lib/me'
import { addedHotel, forgetAdded, setBaseline } from './next-steps-store'

type Step = {
  key: string
  label: string
  done: boolean
  link: (className: string) => ReactNode
}

const linkClass =
  'inline-flex h-11 flex-none items-center rounded-sm px-3 text-sm font-medium transition-colors lg:h-8'

export function NextSteps({ hotel }: { hotel: Property }) {
  const me = useMe()
  const [added, setAdded] = useState(() => addedHotel(hotel.id))
  const summary = useQuery({ ...orpc.organization.home.queryOptions(), enabled: Boolean(added) })
  const counts = summary.data?.byHotel.find((row) => row.propertyId === hotel.id)

  // Who could already work here when it was added (group-wide people), so an invite shows as done.
  useEffect(() => {
    if (added && added.people === null && counts) {
      setBaseline(hotel.id, counts.people)
      setAdded({ people: counts.people })
    }
  }, [added, counts, hotel.id])

  if (!added || !counts) return null
  const steps: Step[] = [
    ...(me.can('rooms.setup') && me.has('front_desk')
      ? [
          {
            key: 'rooms',
            label: 'Set up rooms',
            done: counts.rooms > 0,
            link: (className: string) => (
              <Link to="/rates/rooms" className={className}>
                Set up rooms
              </Link>
            ),
          },
        ]
      : []),
    {
      key: 'team',
      label: 'Invite the team',
      done: added.people !== null && counts.people > added.people,
      link: (className) => (
        <Link to="/settings/members" search={{ invite: hotel.id }} className={className}>
          Invite the team
        </Link>
      ),
    },
    {
      key: 'devices',
      label: 'Register devices',
      done: counts.devices > 0,
      link: (className) => (
        <Link to="/settings/devices" search={{ register: hotel.id }} className={className}>
          Register devices
        </Link>
      ),
    },
  ]
  const dismiss = () => {
    forgetAdded(hotel.id)
    setAdded(undefined)
  }
  if (steps.every((step) => step.done)) return null
  const next = steps.find((step) => !step.done)?.key

  return (
    <section
      aria-labelledby="next-steps-heading"
      className="@container relative overflow-hidden rounded-lg border border-pri-line bg-surface shadow-card"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-pri to-logo-dot" />
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id="next-steps-heading"
            className="truncate text-base font-semibold"
            title={`Next steps for ${hotel.name}`}
          >
            Next steps for {hotel.name}
          </h2>
          <p className="text-sm text-text-2">Get it ready for its first guests.</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss next steps"
          className="-mt-1 -mr-2 grid size-11 flex-none place-items-center rounded-sm text-text-3 hover:bg-surface-2 hover:text-text lg:size-8"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>
      <ol className="grid gap-px border-t border-border bg-border @2xl:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.key} className="flex min-w-0 items-center gap-3 bg-surface px-5 py-3.5">
            <span
              aria-hidden="true"
              className={cn(
                'grid size-6 flex-none place-items-center rounded-full text-xs font-semibold',
                step.done ? 'bg-pri text-white' : 'bg-surface-2 text-text-2 ring-1 ring-border',
              )}
            >
              {step.done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
            </span>
            {step.done ? (
              <span className="grow text-text-2">
                {step.label}
                <span className="sr-only">, done</span>
              </span>
            ) : (
              step.link(
                cn(
                  linkClass,
                  'min-w-0 grow justify-center @2xl:justify-start',
                  step.key === next
                    ? 'bg-pri text-white hover:bg-pri-hover'
                    : 'border border-border-strong bg-surface hover:bg-surface-2',
                ),
              )
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
