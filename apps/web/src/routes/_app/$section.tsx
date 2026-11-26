// A module's page until its own screens ship (lib/navigation.ts). Says plainly what it's for and
// which stage builds it. When a module is built, its own route file (e.g. `reservations.tsx`) takes
// over its path; static routes always win over this one.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { FeatureGate } from '@/components/feature-gate'
import { NoAccess } from '@/components/team/no-access'
import { Card } from '@/components/ui/card'
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
  const Icon = entry.icon

  return (
    <FeatureGate feature={entry.feature}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 pt-4 sm:pt-10">
        <Card className="flex flex-col items-start gap-4 p-6 sm:p-8">
          <span className="inline-grid size-12 place-items-center rounded-md bg-pri-soft text-pri-ink">
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.015em]">{entry.label}</h1>
            <p className="text-md text-text-2">{entry.about}</p>
          </div>
          <p className="rounded-sm bg-surface-2 px-3 py-2 text-sm text-text-2">
            Not available yet. Planned for stage {entry.stage}.
          </p>
        </Card>
      </div>
    </FeatureGate>
  )
}
