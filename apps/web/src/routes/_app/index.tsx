// Home, shaped by the hotel chosen in the top bar and the person's role.
// - All hotels (people who see the whole group; design: ExecHome): the group's key figures, every
//   hotel as a row that opens that hotel's Home, and what needs attention across the group.
// - One hotel (design: GMHome): that role's figures and first actions, the hotel itself, and what
//   needs attention there.
// Figures come from modules that ship from Stage 1, so their tiles say which module brings them.
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Building2, Layers } from 'lucide-react'
import type { ReactNode } from 'react'
import { attentionItems, NeedsAttention } from '@/components/home/attention'
import { FigureTile } from '@/components/home/figure-tile'
import { HotelCard, HotelsBoard } from '@/components/home/hotels'
import { QuickActions } from '@/components/home/quick-actions'
import { type Figure, groupFigures, roleFocus } from '@/components/home/role-focus'
import { SetupChecklist } from '@/components/home/setup-checklist'
import { WelcomeBanner } from '@/components/home/welcome-banner'
import { Workspace } from '@/components/home/workspace'
import { useProperty } from '@/components/shell/property-context'
import { EmptyState } from '@/components/ui/empty-state'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useMe } from '@/lib/me'
import { visibleGroups } from '@/lib/navigation'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/_app/')({
  component: Home,
})

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

// Roles that run a hotel see its setup facts; everyone else just which hotel and its business date.
const RUNS_HOTEL = new Set(['owner', 'group_admin', 'general_manager', 'front_desk', 'finance'])

function Home() {
  const me = useMe()
  // From the sign-in check, so the greeting works offline too.
  const { user } = Route.useRouteContext()
  const hotelsQuery = useQuery(orpc.properties.list.queryOptions({ input: { pageSize: 100 } }))
  const summary = useQuery(orpc.organization.home.queryOptions())
  const { properties, current, allHotels, canSeeAll, select, selectAll } = useProperty()
  const role = me.role
  const firstName = user.name.split(' ')[0]
  const group = me.data?.organization.name ?? ''
  // Team and device prompts are for people who run the setup (and not while previewing a role).
  const managesTeam = me.can('setup.manage') && summary.data?.members != null
  const groupView = allHotels
  const viewName = groupView ? 'All hotels' : current?.name
  usePageTitle(viewName ? `Home · ${viewName}` : 'Home')
  const inView = groupView ? properties : current ? [current] : []
  const attention = attentionItems({
    hotels: inView,
    summary: summary.data,
    managesTeam,
    group: groupView,
  })

  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  }).format(new Date())
  const title = `${greeting()}${firstName ? `, ${firstName}` : ''}`
  const workspace = <Workspace groups={role ? visibleGroups(role, me.has, me.can) : []} />

  // Switching view replaces most of the page, so focus moves to the greeting and the live region
  // says what's now shown; keyboard and screen-reader users never land on nothing.
  function focusTop() {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function openHotel(id: string) {
    select(id)
    focusTop()
  }
  function openGroup() {
    selectAll()
    focusTop()
  }
  const announce = (
    <p className="sr-only" aria-live="polite">
      {viewName ? `Showing ${viewName}` : ''}
    </p>
  )

  if (hotelsQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <WelcomeBanner date={date} title={title} subtitle={group} />
        <p role="alert" className="rounded-lg border border-border bg-surface p-5 text-ro">
          We couldn't load your hotels. Check your connection and refresh.
        </p>
      </div>
    )
  }

  if (!hotelsQuery.isPending && !current) {
    return (
      <div className="flex flex-col gap-6">
        <WelcomeBanner date={date} title={title} subtitle={group} />
        <EmptyState icon={Building2} tone="brand">
          You're not on a hotel yet. An owner can give you access from Settings.
        </EmptyState>
        {workspace}
      </div>
    )
  }

  if (groupView) {
    return (
      <div className="flex flex-col gap-6">
        <WelcomeBanner
          date={date}
          title={title}
          subtitle={[group, plural(properties.length, 'hotel')].filter(Boolean).join(' · ')}
        />
        <Figures heading="Across the group" figures={role ? groupFigures(role) : []} />
        {announce}
        <Columns
          // The hotels come first on phones: picking one is the group view's main job.
          mainFirst
          main={<HotelsBoard hotels={properties} summary={summary.data} onOpen={openHotel} />}
          side={
            <>
              <SetupChecklist />
              <NeedsAttention items={attention} loading={summary.isPending} />
            </>
          }
        />
        {workspace}
      </div>
    )
  }

  const focus = role ? roleFocus(role) : undefined
  return (
    <div className="flex flex-col gap-6">
      <WelcomeBanner
        date={date}
        title={title}
        subtitle={[focus?.job, current?.name].filter(Boolean).join(' · ')}
        aside={
          role && focus ? (
            <QuickActions actions={focus.actions} role={role}>
              {canSeeAll ? (
                <button
                  type="button"
                  onClick={openGroup}
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-white/20 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20 lg:h-10"
                >
                  <Layers className="size-4" aria-hidden="true" strokeWidth={1.9} />
                  All hotels
                </button>
              ) : null}
            </QuickActions>
          ) : undefined
        }
      />
      {announce}
      {focus && current ? (
        <Figures heading={focus.today(current.name)} figures={focus.figures} />
      ) : null}
      <Columns
        main={
          current ? (
            <HotelCard
              hotel={current}
              summary={summary.data}
              managesTeam={managesTeam}
              canSetUpRooms={me.can('rooms.setup')}
              compact={!role || !RUNS_HOTEL.has(role)}
            />
          ) : (
            <div
              role="status"
              aria-label="Loading your hotel"
              className="h-64 animate-pulse rounded-lg bg-surface-2"
            />
          )
        }
        side={
          <>
            <SetupChecklist />
            <NeedsAttention items={attention} loading={summary.isPending || !current} />
          </>
        }
      />
      {workspace}
    </div>
  )
}

function Figures({ heading, figures }: { heading: string; figures: Figure[] }) {
  if (figures.length === 0) return null
  return (
    <section aria-labelledby="figures-heading" className="flex flex-col gap-4">
      <h2 id="figures-heading" className="text-lg font-semibold tracking-[-0.01em]">
        {heading}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {figures.map((figure, index) => (
          <FigureTile key={figure.label} figure={figure} index={index} />
        ))}
      </div>
    </section>
  )
}

// The main card beside what needs doing; on phones, what needs doing comes first unless the main
// card is the page's main job.
function Columns({
  main,
  side,
  mainFirst,
}: {
  main: ReactNode
  side: ReactNode
  mainFirst?: boolean
}) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      {main}
      <div className={cn('flex flex-col gap-6', !mainFirst && 'max-xl:order-first')}>{side}</div>
    </div>
  )
}
