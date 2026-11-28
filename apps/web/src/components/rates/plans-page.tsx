// Rates & channels › Rate plans (design #33; spec stage-1-rate-plans): the hotel's plans, or "Your
// first rate" when it has none. Read-only for the front desk and offline.
import { Link } from '@tanstack/react-router'
import type { Property, RatesOverview } from '@vento/shared'
import { AlertTriangle, ListChecks, Plus } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { useOnline } from '@/offline/connection'
import { FirstRate } from './first-rate'
import { listNames, NEEDS_CONNECTION, perNight, plural } from './format'
import { PlansList } from './plans-list'
import { useRatesOverview } from './queries'
import { RatesHotel } from './rates-hotel'
import { RatesSkeleton } from './skeletons'
import { NoRoomsYet, RatesLoadError, RatesOffline } from './states'

type Props = { archived: boolean; onArchived: (archived: boolean) => void }

export function PlansPage(props: Props) {
  return (
    <RatesHotel title="Rate plans" description="Prices and conditions for each room type.">
      {(hotel) => <HotelPlans hotel={hotel} {...props} />}
    </RatesHotel>
  )
}

function HotelPlans({ hotel, archived, onArchived }: Props & { hotel: Property }) {
  const online = useOnline()
  const overview = useRatesOverview(hotel.id)
  if (overview.isPending) return <RatesSkeleton title="Rate plans" />
  if (overview.isError) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Rate plans" />
        <RatesLoadError onRetry={() => void overview.refetch()} />
      </div>
    )
  }
  const o = overview.data
  if (o.roomTypes.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Rate plans" />
        <NoRoomsYet />
      </div>
    )
  }
  // Every plan archived: the archived list, to restore one (createFirst answers PLANS_ARCHIVED).
  const allArchived = o.activePlans === 0 && o.archivedPlans > 0
  if (o.activePlans === 0 && o.archivedPlans === 0) {
    if (o.canEdit) {
      return (
        <div className="flex flex-col gap-4">
          <RatesOffline updatedAt={overview.dataUpdatedAt} />
          <FirstRate overview={o} />
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Rate plans" />
        <EmptyState icon={ListChecks} tone="brand">
          No rate plans yet. A rate plan sets the price and conditions for a room type.
        </EmptyState>
      </div>
    )
  }

  const canWrite = o.canEdit && online
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Rate plans"
        badge={<LiveBadge live={o.property.live} />}
        description={
          <span className="num">{`${plural(o.activePlans, 'plan')} · ${perNight({ exclusive: o.exclusivePlans, total: o.activePlans })}`}</span>
        }
        actions={
          o.canEdit ? (
            <>
              {!online ? (
                <span className="self-center text-sm text-text-3">{NEEDS_CONNECTION}</span>
              ) : null}
              <Link
                to="/rates/plans/new"
                disabled={!online}
                aria-disabled={!online || undefined}
                className={cn(
                  'inline-flex h-11 items-center gap-1.5 rounded-sm bg-pri px-4 font-medium text-white hover:bg-pri-hover lg:h-10',
                  !online && 'pointer-events-none opacity-45',
                )}
              >
                <Plus className="size-4" aria-hidden="true" />
                New rate plan
              </Link>
            </>
          ) : null
        }
      />
      <RatesOffline />
      {o.canEdit ? null : <p className="-mt-2 text-text-2">You can read rates. {ASK}</p>}
      <Unpriced overview={o} canWrite={canWrite} />
      <PlansList
        propertyId={hotel.id}
        archived={archived || allArchived}
        counts={{ active: o.activePlans, archived: o.archivedPlans }}
        canWrite={canWrite}
        onArchived={onArchived}
      />
    </div>
  )
}

const ASK = 'Only a revenue manager, GM or the owner can change them.'

export function LiveBadge({ live }: { live: boolean }) {
  return live ? (
    <span title="Live: lowering tonight's price asks for a reason.">
      <StatusBadge tone="emerald">
        Live<span className="sr-only">: lowering tonight's price asks for a reason.</span>
      </StatusBadge>
    </span>
  ) : (
    <span title="Setting up: no night audit yet. Changes need no reason.">
      <StatusBadge tone="amber">Setting up</StatusBadge>
    </span>
  )
}

// "Executive Suite isn't priced on any plan." → Add to Best available.
function Unpriced({ overview, canWrite }: { overview: RatesOverview; canWrite: boolean }) {
  const types = overview.unpricedRoomTypes
  const first = types[0]
  if (!first) return null
  const plan = overview.basePlan
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-am-dot/30 bg-am-bg px-4 py-3 text-am">
      <AlertTriangle className="size-4 flex-none" aria-hidden="true" />
      <p className="grow">
        {listNames(types.map((t) => t.name))} {types.length === 1 ? "isn't" : "aren't"} priced on
        any plan.
      </p>
      {plan && canWrite ? (
        <Link
          to="/rates/plans/$planId"
          params={{ planId: plan.id }}
          search={{ add: first.id }}
          className="inline-flex h-11 items-center rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text hover:bg-surface-2 lg:h-8"
        >
          Add to {plan.name}
        </Link>
      ) : null}
    </div>
  )
}
