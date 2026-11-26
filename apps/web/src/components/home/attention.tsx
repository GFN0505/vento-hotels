// "Needs attention" (designs: ExecHome and GMHome): the few things worth acting on now, each with
// what's wrong, why it matters and one way to fix it. Today it watches what Stage 0 knows (the
// business date, staff, devices and invites); each module adds its own checks as it ships.

import { Link } from '@tanstack/react-router'
import { calendarDateIn, type HomeSummary, type Property } from '@vento/shared'
import {
  CalendarClock,
  CircleCheck,
  type LucideIcon,
  MailPlus,
  MonitorSmartphone,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/cn'

export type AttentionItem = {
  key: string
  icon: LucideIcon
  tone: 'amber' | 'blue' | 'violet'
  title: string
  detail: string
  action?: { label: string; to: '/settings/devices' | '/settings/members' }
}

const TONES = {
  amber: 'bg-am-bg text-am',
  blue: 'bg-bl-bg text-bl',
  violet: 'bg-pri-soft text-pri-ink',
} as const

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function attentionItems({
  hotels,
  summary,
  managesTeam,
  group,
}: {
  hotels: Property[]
  summary: HomeSummary | undefined
  managesTeam: boolean
  // The whole group is in view, so name the hotel in each line.
  group: boolean
}): AttentionItem[] {
  const items: AttentionItem[] = []
  const withoutDevices: Property[] = []
  const where = (hotel: Property) => (group ? ` at ${hotel.name}` : '')
  for (const hotel of hotels) {
    const today = calendarDateIn(hotel.timeZone)
    if (hotel.businessDate !== today) {
      items.push({
        key: `date-${hotel.id}`,
        icon: CalendarClock,
        tone: 'amber',
        title: `Business date is behind${where(hotel)}`,
        detail: `It's still ${shortDate(hotel.businessDate)} while the calendar says ${shortDate(today)}. Night audit moves it forward.`,
      })
    }
    if (!managesTeam || !summary) continue
    const counts = summary.byHotel.find((row) => row.propertyId === hotel.id)
    if (counts && counts.devices === 0) withoutDevices.push(hotel)
  }
  // One line for all hotels without devices, so the list stays short across a group.
  const [onlyHotel] = withoutDevices
  if (onlyHotel) {
    items.push({
      key: 'devices',
      icon: MonitorSmartphone,
      tone: 'blue',
      title:
        withoutDevices.length === 1
          ? `No shared devices${where(onlyHotel)}`
          : `${withoutDevices.length} hotels have no shared devices`,
      detail:
        withoutDevices.length === 1
          ? 'Front desk, restaurant and housekeeping staff sign in with a PIN on one.'
          : `${withoutDevices.map((hotel) => hotel.name).join(', ')}. Staff sign in with a PIN on one.`,
      action: { label: 'Register', to: '/settings/devices' },
    })
  }
  if (managesTeam && summary?.pendingInvites) {
    items.push({
      key: 'invites',
      icon: MailPlus,
      tone: 'violet',
      title: `${plural(summary.pendingInvites, 'invite')} not accepted yet`,
      detail: 'You can resend or cancel from the team list.',
      action: { label: 'Review', to: '/settings/members' },
    })
  }
  if (managesTeam && summary?.members === 1) {
    items.push({
      key: 'team',
      icon: Users,
      tone: 'violet',
      title: 'Just you so far',
      detail: 'Invite your managers and staff, each with their own role and hotels.',
      action: { label: 'Invite', to: '/settings/members' },
    })
  }
  return items
}

export function NeedsAttention({
  items,
  loading,
  className,
}: {
  items: AttentionItem[]
  loading: boolean
  className?: string
}) {
  return (
    <section
      aria-labelledby="attention-heading"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface shadow-card',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="attention-heading" className="text-base font-semibold">
          Needs attention
        </h2>
        {!loading && items.length > 0 ? (
          <span
            className={cn(
              'num grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold',
              items.some((item) => item.tone === 'amber')
                ? 'bg-am-bg text-am'
                : 'bg-pri-soft text-pri-ink',
            )}
          >
            {items.length}
          </span>
        ) : null}
      </header>
      {loading ? (
        <div role="status" aria-label="Loading" className="flex flex-col gap-3 p-5">
          {[0, 1].map((i) => (
            <span key={i} className="h-12 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="grid size-10 flex-none place-items-center rounded-full bg-em-bg text-em">
            <CircleCheck className="size-5" aria-hidden="true" strokeWidth={1.9} />
          </span>
          <span className="flex flex-col">
            <span className="font-medium">All clear</span>
            <span className="text-sm text-text-2">Nothing needs you right now.</span>
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.key} className="flex items-start gap-3 px-5 py-4">
                <span
                  className={cn(
                    'grid size-9 flex-none place-items-center rounded-lg',
                    TONES[item.tone],
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" strokeWidth={1.9} />
                </span>
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-sm text-text-2">{item.detail}</span>
                </span>
                {item.action ? (
                  <Link
                    to={item.action.to}
                    className="inline-flex h-11 flex-none items-center rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium transition-colors hover:bg-surface-2 lg:h-8"
                  >
                    {item.action.label}
                  </Link>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
