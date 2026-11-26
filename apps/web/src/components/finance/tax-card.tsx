// One tax or charge (design #27 TaxRules): who it covers, what it applies to, who it's paid to, and
// its dated rates with their status. Scheduled changes can be cancelled; rates in force with no
// recorded source show To verify until someone marks them verified.
import { useMutation } from '@tanstack/react-query'
import { calendarDateIn, type TaxRateView, type TaxSetup, type TaxView } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { dateLabel } from '@/components/hotels/format'
import { TD, TH } from '@/components/settings/table-styles'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { categoriesLabel, effectiveLabel, rateLabel, STATUS_LABEL, STATUS_TONE } from './format'
import { VerifyDialog } from './verify-dialog'

type Props = {
  tax: TaxView
  setup: TaxSetup
  canWrite: boolean
  onSaved: (setup: TaxSetup) => void
  onSchedule: () => void
}

export function TaxCard({ tax, setup, canWrite, onSaved, onSchedule }: Props) {
  const [verifying, setVerifying] = useState<TaxRateView>()
  const [cancelling, setCancelling] = useState<TaxRateView>()
  const current = tax.rates.find((rate) => rate.status === 'current' || rate.status === 'stopped')
  const shown = tax.rates.find((rate) => rate.status === 'current') ?? tax.rates[0]
  const paidTo =
    tax.kind === 'service_charge' ? 'kept by the hotel' : `paid to ${tax.paidTo ?? '–'}`
  const sub = [tax.scope, shown && !shown.stop ? categoriesLabel(shown.categories) : null, paidTo]
    .filter(Boolean)
    .join(' · ')
  const changeable = canWrite && tax.canChange
  const headingId = `tax-${tax.id}`

  const cancel = useMutation({
    mutationFn: (reason: string) =>
      api.taxes.cancel({
        propertyId: setup.property.id,
        rateId: cancelling?.id ?? '',
        version: tax.version,
        reason,
      }),
    onSuccess: (next) => {
      onSaved(next)
      setCancelling(undefined)
      toast.success('Scheduled change cancelled')
    },
  })

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className="truncate font-semibold" title={tax.name}>
            {tax.name}
          </h2>
          <p className="text-sm text-text-2">{sub}</p>
          {tax.notCharged ? (
            <p className="mt-1">
              <StatusBadge className="whitespace-normal">{tax.notCharged}</StatusBadge>
            </p>
          ) : null}
          {tax.readOnlyReason && setup.canEdit ? (
            <p className="mt-1 text-sm text-text-3">{tax.readOnlyReason}</p>
          ) : null}
        </div>
        {setup.canEdit && tax.canChange ? (
          <Button className="max-lg:h-11" disabled={!changeable} onClick={onSchedule}>
            Schedule a change
          </Button>
        ) : null}
      </div>
      <table className="w-full border-separate border-spacing-0 text-left max-md:block">
        <thead className="max-md:sr-only">
          <tr>
            <th scope="col" className={cn(TH, 'pl-5')}>
              Rate
            </th>
            <th scope="col" className={TH}>
              Effective
            </th>
            <th scope="col" className={TH}>
              Set by
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={cn(TH, 'pr-5')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="max-md:block max-md:divide-y max-md:divide-border">
          {tax.rates.map((rate) => {
            const faint = rate.status === 'past'
            return (
              <tr
                key={rate.id}
                className="max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-4 max-md:gap-y-1.5 max-md:px-4 max-md:py-3 md:[&>td]:border-b md:[&>td]:border-border md:last:[&>td]:border-0"
              >
                <td className={cn(TD, 'num pl-5 font-medium', faint && 'text-text-3')}>
                  {rateLabel(rate)}
                  {rate.base === 'net_plus_service_charge' && !rate.stop ? (
                    <span className="block text-xs font-normal text-text-3">
                      on charge + service charge
                    </span>
                  ) : null}
                </td>
                <td className={cn(TD, 'num', faint ? 'text-text-3' : 'text-text-2')}>
                  {rate.stop
                    ? `${rate.status === 'scheduled' ? 'from' : 'since'} ${dateLabel(rate.effectiveFrom)}`
                    : effectiveLabel(rate)}
                </td>
                <td className={cn(TD, faint ? 'text-text-3' : 'text-text-2', 'max-md:basis-full')}>
                  <span className="block truncate" title={rate.reason ?? undefined}>
                    {rate.setByName}
                    {rate.status === 'scheduled'
                      ? ` · ${dateLabel(calendarDateIn(setup.property.timeZone, new Date(rate.setAt)))}`
                      : ''}
                  </span>
                </td>
                <td className={TD}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={STATUS_TONE[rate.status]}>
                      {STATUS_LABEL[rate.status]}
                    </StatusBadge>
                    {rate.toVerify ? <StatusBadge tone="amber">To verify</StatusBadge> : null}
                    {rate.verifiedByName && rate.verifiedOn && rate.status !== 'past' ? (
                      <span className="text-xs text-text-3">
                        Verified · {rate.verifiedByName} · {dateLabel(rate.verifiedOn)}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className={cn(TD, 'pr-5 text-right')}>
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {rate.status === 'scheduled' && setup.canEdit && tax.canChange ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="max-lg:h-11"
                        disabled={!changeable}
                        onClick={() => setCancelling(rate)}
                      >
                        Cancel change
                      </Button>
                    ) : null}
                    {rate.toVerify && setup.canEdit && tax.canChange ? (
                      <Button
                        size="sm"
                        className="max-lg:h-11"
                        disabled={!changeable}
                        onClick={() => setVerifying(rate)}
                      >
                        Mark verified
                      </Button>
                    ) : null}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {verifying ? (
        <VerifyDialog
          tax={tax}
          rate={verifying}
          propertyId={setup.property.id}
          onSaved={onSaved}
          onClose={() => setVerifying(undefined)}
        />
      ) : null}
      <ReasonDialog
        open={cancelling !== undefined}
        title="Cancel change"
        description={
          cancelling
            ? `Cancel the change to ${rateLabel(cancelling)} from ${dateLabel(cancelling.effectiveFrom)}? ${tax.name} stays at ${current ? rateLabel(current) : 'its current rate'}.`
            : undefined
        }
        label="Reason"
        confirmLabel="Cancel change"
        destructive
        pending={cancel.isPending}
        error={cancel.error ? problemMessage(cancel.error) : undefined}
        onConfirm={(reason) => cancel.mutate(reason)}
        onClose={() => {
          cancel.reset()
          setCancelling(undefined)
        }}
      />
    </Card>
  )
}
