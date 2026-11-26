// The rate plan editor's page (design #33, RatePlanEdit / RatePlanM): loads the hotel's overview,
// the plan (or the plan being copied) and the plans it could follow, then the editor. A plan from
// another hotel (the switch moved) goes back to the list.
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate } from '@tanstack/react-router'
import type { Property } from '@vento/shared'
import { ChevronLeft, SearchX } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { PlanEditor } from './plan-editor'
import { planQuery, plansQuery, useRatesOverview } from './queries'
import { RatesHotel } from './rates-hotel'
import { EditorSkeleton } from './skeletons'
import { RatesLoadError } from './states'

type Props = { planId?: string; copyOf?: string | undefined; addRoomType?: string | undefined }

export function PlanEditorPage(props: Props) {
  return (
    <RatesHotel
      title={props.planId ? 'Rate plan' : 'New rate plan'}
      description="Prices and conditions for each room type."
    >
      {(hotel) => <Loader hotel={hotel} {...props} />}
    </RatesHotel>
  )
}

export function BackToPlans() {
  return (
    <Link
      to="/rates/plans"
      className="-mb-2 inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-text-2 hover:text-pri-ink lg:min-h-0"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      Rate plans
    </Link>
  )
}

function Loader({ hotel, planId, copyOf, addRoomType }: Props & { hotel: Property }) {
  const overview = useRatesOverview(hotel.id)
  const sourceId = planId ?? copyOf
  const plan = useQuery({ ...planQuery(sourceId ?? ''), enabled: Boolean(sourceId) })
  const plans = useQuery(plansQuery(hotel.id))
  if (overview.isPending || plans.isPending || (sourceId && plan.isPending)) {
    return <EditorSkeleton />
  }
  if (sourceId && plan.isError && (plan.error as { status?: number }).status === 404) {
    return (
      <div className="flex flex-col gap-5">
        <BackToPlans />
        <PageHeader title="Rate plan" />
        <EmptyState icon={SearchX}>We couldn't find that rate plan at {hotel.name}.</EmptyState>
      </div>
    )
  }
  if (overview.isError || plans.isError || (sourceId && plan.isError)) {
    return (
      <div className="flex flex-col gap-5">
        <BackToPlans />
        <PageHeader title="Rate plan" />
        <RatesLoadError
          what="the rate plan"
          onRetry={() => void Promise.all([overview.refetch(), plans.refetch(), plan.refetch()])}
        />
      </div>
    )
  }
  const source = sourceId ? plan.data : undefined
  // The switch moved to another hotel: this plan isn't one of its plans.
  if (source && source.propertyId !== hotel.id) return <Navigate to="/rates/plans" replace />
  return (
    <PlanEditor
      overview={overview.data}
      plan={source}
      copy={Boolean(copyOf && !planId)}
      plans={plans.data.items}
      addRoomTypes={addRoomType ? addRoomType.split(',') : []}
    />
  )
}
