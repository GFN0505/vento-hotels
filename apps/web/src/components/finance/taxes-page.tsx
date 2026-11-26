// Settings › Taxes and charges (design #27 TaxSetup; spec: stage-1-taxes-and-payment-methods.md). A
// hotel page: with All hotels it asks for a hotel. Finance and the owner change it; people who
// price rooms read it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TaxSetup, TaxView } from '@vento/shared'
import { Building2, Plus, Receipt } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RowsSkeleton } from '@/components/settings/load-states'
import { NEEDS_CONNECTION, SettingsOffline } from '@/components/settings/offline-note'
import { PickHotel } from '@/components/shell/pick-hotel'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { api, orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { useOnline } from '@/offline/connection'
import { BillPreview } from './bill-preview'
import { FinanceLoadError } from './load-error'
import { ScheduleSheet } from './schedule-sheet'
import { TaxCard } from './tax-card'

export const TAXES_OFFLINE =
  'Tax and payment settings are read-only offline. Bills keep using the rules saved on each device.'

export function TaxesPage() {
  useScopedTitle('Taxes and charges')
  const me = useMe()
  const { current, allHotels, scope, ready } = useProperty()
  if (me.isPending || (!scope && !ready)) return <RowsSkeleton rows={4} label="Loading taxes" />
  if (!(me.can('finance.setup') || me.can('rates.edit') || me.can('rooms.setup'))) {
    return (
      <NoAccess
        what="taxes and charges"
        ask="Finance, the owner, GMs and revenue managers can view a hotel's taxes. Ask your finance team if you need to."
      />
    )
  }
  if (allHotels) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          scope="pick"
          title="Taxes and charges"
          description="VAT, consumption tax and service charge for each hotel."
        />
        <PickHotel title="Taxes are set per hotel. Pick a hotel." />
      </div>
    )
  }
  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Taxes and charges" />
        <EmptyState icon={Building2} tone="brand">
          You're not on a hotel yet. An owner can give you access from Settings.
        </EmptyState>
      </div>
    )
  }
  return <HotelTaxes key={current.id} propertyId={current.id} />
}

type Sheet = { kind: 'schedule'; tax: TaxView } | { kind: 'add' }

function HotelTaxes({ propertyId }: { propertyId: string }) {
  const online = useOnline()
  const client = useQueryClient()
  const query = useQuery(orpc.taxes.get.queryOptions({ input: { propertyId } }))
  const [sheet, setSheet] = useState<Sheet>()
  const key = orpc.taxes.get.queryKey({ input: { propertyId } })
  const saved = (setup: TaxSetup) => {
    client.setQueryData(key, setup)
    void client.invalidateQueries({ queryKey: orpc.taxes.inForce.key() })
  }
  const setUp = useMutation({
    mutationFn: () => api.taxes.setUp({ propertyId }),
    onSuccess: (setup) => {
      saved(setup)
      toast.success(`Taxes set up for ${setup.property.name}`)
    },
    onError: (error) => toast.error(problemMessage(error)),
  })

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Taxes and charges" />
        <Card>
          <RowsSkeleton rows={6} label="Loading taxes" />
        </Card>
      </div>
    )
  }
  if (query.isError && !query.data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Taxes and charges" />
        <FinanceLoadError
          title="Couldn't load tax rules"
          body="Nothing changed. Bills keep using the rules in force."
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    )
  }
  const setup = query.data
  const { property } = setup
  const canWrite = setup.canEdit && online
  const description = `${property.name}${property.stateName ? ` · ${property.stateName}` : ''} · every rate has a start date; nothing changes in place`

  if (!setup.setUp) {
    return (
      <div className="flex flex-col gap-5">
        <SettingsOffline note={TAXES_OFFLINE} />
        <PageHeader title="Taxes and charges" description={description} />
        <SetUpEmpty
          setup={setup}
          canWrite={canWrite}
          pending={setUp.isPending}
          onSetUp={() => setUp.mutate()}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsOffline note={TAXES_OFFLINE} />
      <PageHeader
        title="Taxes and charges"
        description={description}
        actions={
          setup.canEdit ? (
            <span className="flex items-center gap-3">
              {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
              <Button
                variant="primary"
                size="lg"
                className="max-lg:h-11"
                disabled={!canWrite}
                onClick={() => setSheet({ kind: 'add' })}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add a tax or charge
              </Button>
            </span>
          ) : null
        }
      />
      <p className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-2">
        {orderLine(setup)}
      </p>
      {setup.taxes.map((tax) => (
        <TaxCard
          key={tax.id}
          tax={tax}
          setup={setup}
          canWrite={canWrite}
          onSaved={saved}
          onSchedule={() => setSheet({ kind: 'schedule', tax })}
        />
      ))}
      <BillPreview setup={setup} />
      {sheet ? (
        <ScheduleSheet
          setup={setup}
          tax={sheet.kind === 'schedule' ? sheet.tax : undefined}
          onSaved={saved}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
    </div>
  )
}

// "Order: service charge, VAT and consumption tax are each calculated on the net charge, then shown
// as separate lines on every bill." Generated from the rules, so it can't disagree with them.
function orderLine(setup: TaxSetup): string {
  const names = setup.taxes.map((tax) =>
    tax.kind === 'service_charge' ? 'service charge' : tax.kind === 'vat' ? 'VAT' : tax.name,
  )
  const list =
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  const onServiceCharge = setup.taxes.filter(
    (tax) => tax.rates.find((r) => r.status === 'current')?.base === 'net_plus_service_charge',
  )
  const base =
    onServiceCharge.length === 0
      ? 'are each calculated on the net charge'
      : `are calculated on the net charge (${onServiceCharge.map((t) => t.name).join(', ')} on the charge plus service charge)`
  return `Order: ${list} ${base}, then shown as separate lines on every bill.`
}

function SetUpEmpty({
  setup,
  canWrite,
  pending,
  onSetUp,
}: {
  setup: TaxSetup
  canWrite: boolean
  pending: boolean
  onSetUp: () => void
}) {
  const { property, plan } = setup
  const lines: string[] = []
  if (!property.stateName) {
    lines.push(`Add ${property.name}'s state on Settings › Hotels first. Its taxes depend on it.`)
  } else {
    lines.push(
      "Pick the state for this property and we'll add VAT, its consumption tax and a service charge with today's rates. You can change each one.",
    )
    if (plan.noStateTemplate) {
      lines.push(
        `No consumption tax on file for ${property.stateName}. If your hotels there pay one, add it.`,
      )
    } else if (!plan.vat && !plan.stateTax) {
      lines.push(`VAT and ${property.stateName} consumption tax are already set up for the group.`)
    }
  }
  return (
    <EmptyState
      icon={Receipt}
      tone="brand"
      action={
        setup.canEdit && property.stateName ? (
          <Button
            variant="primary"
            size="lg"
            className="max-lg:h-11"
            disabled={!canWrite}
            loading={pending}
            onClick={onSetUp}
          >
            Set up for {property.stateName}
          </Button>
        ) : undefined
      }
    >
      <span className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-text">No taxes set up</span>
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
        {setup.canEdit ? null : (
          <span>
            Only finance or the owner can change taxes and payment setup. Ask your finance team.
          </span>
        )}
      </span>
    </EmptyState>
  )
}
