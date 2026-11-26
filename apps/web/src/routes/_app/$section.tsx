// A module's page until its own screens ship (lib/navigation.ts): its title with "Coming soon",
// and what it's for. When a module is built, its own route file (e.g. `reservations.tsx`) takes
// over its path; static routes always win over this one.
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'
import { NoAccess } from '@/components/team/no-access'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { useMe } from '@/lib/me'
import { findModule, roleSees } from '@/lib/navigation'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/_app/$section')({
  beforeLoad: ({ params }) => {
    if (!findModule(`/${params.section}`)) throw notFound()
  },
  component: ModulePage,
})

function ModulePage() {
  const { section } = Route.useParams()
  const entry = findModule(`/${section}`)
  const me = useMe()
  usePageTitle(entry?.label ?? 'Vento')
  if (!entry || me.isPending) return null
  if (me.role && !roleSees(me.role, entry)) return <NoAccess what={entry.label} />
  return (
    <FeatureGate feature={entry.feature}>
      <div className="flex flex-col gap-6">
        <PageHeader title={entry.label} badge={<StatusBadge>Coming soon</StatusBadge>} />
        <EmptyState
          icon={entry.icon}
          action={
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-sm border border-border-strong bg-surface px-4 font-medium text-text hover:bg-surface-2 lg:h-9"
            >
              Back to home
            </Link>
          }
        >
          {entry.about}
        </EmptyState>
      </div>
    </FeatureGate>
  )
}
