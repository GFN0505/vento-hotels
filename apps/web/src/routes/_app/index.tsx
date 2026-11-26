// Home (designs: OnbHome "Home with setup checklist", ExecHome for the look): a greeting, the
// group's key figures, its hotels, and the setup checklist until it's done. The full executive and
// GM homes arrive with the modules that feed them (Stage 1 onwards).
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { calendarDateIn, type Property } from '@vento/shared'
import {
  BedDouble,
  Building2,
  CalendarDays,
  ListChecks,
  MonitorSmartphone,
  Users,
} from 'lucide-react'
import { SetupChecklist } from '@/components/home/setup-checklist'
import { useSetupSteps } from '@/components/home/setup-steps'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { authClient } from '@/lib/auth'
import { useMe } from '@/lib/me'
import { initials } from '@/lib/team'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/_app/')({
  component: Home,
})

function formatDate(date: string, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat('en-GB', {
    ...(style === 'long' ? { weekday: 'short' as const, year: 'numeric' as const } : {}),
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

// "Good morning" by the time in Lagos, where the group works.
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Africa/Lagos',
    }).format(new Date()),
  )
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function Home() {
  usePageTitle('Home')
  const me = useMe()
  const session = authClient.useSession()
  const summary = useQuery(orpc.organization.home.queryOptions())
  const properties = useQuery(orpc.properties.list.queryOptions({ input: { pageSize: 100 } }))
  const setup = useSetupSteps()
  const firstName = session.data?.user.name.split(' ')[0]
  const group = me.data?.organization.name ?? ''
  const hotel = properties.data?.items[0]
  const s = summary.data
  const managesTeam = s ? s.members !== null : false
  const showSetup = managesTeam && setup.ready && setup.done < setup.steps.length
  // The business date only moves at night audit, so after midnight it can trail the calendar.
  const behind = hotel ? hotel.businessDate !== calendarDateIn(hotel.timeZone) : false

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={[group, hotel ? formatDate(hotel.businessDate) : null]
          .filter(Boolean)
          .join(' · ')}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {showSetup ? (
          <StatTile
            icon={ListChecks}
            label="Setup"
            value={`${setup.done} of ${setup.steps.length}`}
            context="steps done"
          >
            <span className="h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-linear-to-r from-pri to-logo-dot"
                style={{ width: `${(setup.done / setup.steps.length) * 100}%` }}
              />
            </span>
          </StatTile>
        ) : (
          <StatTile
            icon={Building2}
            label="Hotels"
            value={s?.hotels}
            context={s && s.hotels === 1 ? hotel?.name : `in ${group}`}
          />
        )}
        {managesTeam ? (
          <StatTile
            icon={Users}
            tone="blue"
            label="Team"
            value={s?.members ?? undefined}
            context={
              s?.pendingInvites
                ? `${plural(s.pendingInvites, 'invite')} waiting`
                : s?.members === 1
                  ? 'Just you so far'
                  : 'with their own sign-in'
            }
            to="/settings/members"
          />
        ) : null}
        {managesTeam ? (
          <StatTile
            icon={MonitorSmartphone}
            tone="emerald"
            label="Shared devices"
            value={s?.devices ?? undefined}
            context={s?.devices === 0 ? 'None registered yet' : 'Staff sign in with a PIN'}
            to="/settings/devices"
          />
        ) : null}
        <StatTile
          icon={CalendarDays}
          tone={behind ? 'amber' : 'slate'}
          label="Business date"
          value={hotel ? formatDate(hotel.businessDate, 'short') : undefined}
          context={behind ? 'Behind the calendar: run night audit' : 'Moves forward at night audit'}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Hotels properties={properties} />
        {/* While setup is unfinished, it comes first on phones. */}
        <SetupChecklist className="max-xl:order-first" />
      </div>
    </div>
  )
}

type HotelsQuery = {
  isPending: boolean
  isError: boolean
  data?: { items: Property[] } | undefined
}

function Hotels({ properties }: { properties: HotelsQuery }) {
  const count = properties.data?.items.length
  return (
    <section
      aria-labelledby="hotels-heading"
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-card"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="hotels-heading" className="text-base font-semibold">
          Your hotels
        </h2>
        {count ? <StatusBadge>{plural(count, 'hotel')}</StatusBadge> : null}
      </header>
      {properties.isPending ? (
        <div role="status" aria-label="Loading hotels" className="flex flex-col gap-3 p-5">
          {[0, 1].map((i) => (
            <span key={i} className="h-14 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      ) : properties.isError || !properties.data ? (
        <p role="alert" className="p-5 text-ro">
          We couldn't load your hotels. Check your connection and refresh.
        </p>
      ) : properties.data.items.length === 0 ? (
        <EmptyState icon={Building2} tone="brand" className="rounded-none border-0 shadow-none">
          You're not on a hotel yet. An owner can give you access from Settings.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {properties.data.items.map((property) => (
            <li
              key={property.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-surface-2/60 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
            >
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-lg bg-pri-soft text-sm font-semibold text-pri-ink"
              >
                {initials(property.name)}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-md font-semibold break-words">{property.name}</span>
                <span className="text-sm text-text-2">
                  {[property.area, property.state].filter(Boolean).join(', ') ||
                    'Address not set yet'}
                </span>
              </div>
              {/* One row under the name on phones; their own columns from sm up. */}
              <div className="col-start-2 flex flex-wrap items-center gap-x-6 gap-y-2 sm:contents">
                <Pair label="Check-in" value={property.checkInTime} />
                <Pair label="Check-out" value={property.checkOutTime} />
                <span>
                  <StatusBadge tone="emerald">Open</StatusBadge>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="m-4 flex items-center gap-3 rounded-md border border-dashed border-border-strong px-4 py-3.5 text-sm text-text-2">
        <span
          className="grid size-8 flex-none place-items-center rounded-lg bg-surface-2"
          aria-hidden="true"
        >
          <BedDouble className="size-4" strokeWidth={1.8} />
        </span>
        <span>
          Rooms, tonight's occupancy and arrivals will show here once front office is running.
        </span>
      </div>
    </section>
  )
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-xs text-text-3">{label}</span>
      <span className="num text-sm font-medium">{value}</span>
    </span>
  )
}
