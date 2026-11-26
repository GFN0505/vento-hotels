// One hotel's settings (design #25 SetProperty, SetPropertyM; spec: "Hotel settings"): identity,
// address, time and business date, one Save for the page, and Archive at the foot. People with
// only `property.operating_times` (GMs) change the check-in and check-out times; the rest is
// read-only for them. Offline, everything is read-only.
import { useQuery } from '@tanstack/react-query'
import type { Property } from '@vento/shared'
import { ChevronLeft, MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { NEEDS_CONNECTION, SettingsOffline } from '@/components/settings/offline-note'
import { useProperty } from '@/components/shell/property-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { usePageTitle } from '@/lib/title'
import { useOnline } from '@/offline/connection'
import { AddressFields } from './address-fields'
import { ArchiveHotel } from './archive-hotel'
import { BusinessDatePanel } from './business-date-panel'
import { addressMissing, hotelStatus } from './format'
import { IdentityCard } from './identity-card'
import { LeaveConfirm } from './leave-confirm'
import { NextSteps } from './next-steps'
import { TimeFields, TimeZoneField } from './time-fields'
import { useHotelForm } from './use-hotel-form'

const FORM_ID = 'hotel-settings'

export function HotelSettings({ hotel, addButton }: { hotel: Property; addButton: ReactNode }) {
  usePageTitle(`${hotel.name} · Hotel settings`)
  const me = useMe()
  const online = useOnline()
  const { canSeeAll, selectAll } = useProperty()
  // The switch's copy shows at once (and offline); the fresh one brings the latest version.
  const fresh = useQuery({
    ...orpc.properties.get.queryOptions({ input: { id: hotel.id } }),
    placeholderData: hotel,
  })
  const latest = fresh.data ?? hotel
  const state = useHotelForm(latest, async () => (await fresh.refetch()).data)
  const { base, form, problems } = state
  const canManage = me.can('setup.manage')
  const canTimes = canManage || me.can('property.operating_times')
  const status = hotelStatus(base)
  const save = (
    <Button
      type="submit"
      form={FORM_ID}
      variant="primary"
      size="lg"
      className="max-lg:h-11"
      disabled={!online || !state.dirty}
      loading={state.saving}
    >
      Save changes
    </Button>
  )

  return (
    <div className="flex flex-col gap-5 pb-16 md:pb-0">
      <SettingsOffline />
      {canSeeAll ? (
        <button
          type="button"
          onClick={selectAll}
          className="-mb-2 inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-text-2 hover:text-pri-ink lg:min-h-0"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          All hotels
        </button>
      ) : null}
      <PageHeader
        title={<span className="break-words">{base.name}</span>}
        badge={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        description={`Hotel settings · Owned by ${base.entityName}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
            {addButton}
            {canTimes ? <span className="max-md:hidden">{save}</span> : null}
          </span>
        }
      />
      <NextSteps hotel={base} />
      {addressMissing(base) ? (
        <p className="flex items-start gap-2.5 rounded-lg border border-am-dot/30 bg-am-bg px-4 py-3 text-am">
          <MapPin className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          Add {base.name}'s address. Registration cards, invoices and guest messages use it.
        </p>
      ) : null}
      {problems.form ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg bg-ro-bg px-4 py-3 text-ro"
        >
          <p className="grow">{problems.form}</p>
          {state.stale ? (
            <Button className="max-lg:h-11" loading={state.reloadPending} onClick={state.reload}>
              Reload
            </Button>
          ) : null}
        </div>
      ) : null}

      <form id={FORM_ID} onSubmit={state.submit} noValidate className="flex flex-col gap-5">
        <IdentityCard state={state} canManage={canManage} online={online} />
        <Section title="Address">
          <AddressFields
            form={form}
            problems={problems}
            disabled={!canManage || !online}
            onChange={state.set}
          />
        </Section>
        <Section title="Time and business date">
          <div className="grid gap-4 sm:grid-cols-3">
            <TimeZoneField
              value={form.timeZone}
              live={base.liveSince !== null}
              disabled={!canManage || !online}
              error={problems.timeZone}
              onChange={(timeZone) => state.set({ timeZone })}
            />
            <TimeFields
              form={form}
              problems={problems}
              disabled={!canTimes || !online}
              onChange={state.set}
            />
          </div>
          <BusinessDatePanel hotel={base} />
        </Section>
      </form>

      {canManage ? <ArchiveHotel hotel={base} online={online} /> : null}

      {canTimes ? (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-border bg-surface px-4 py-3 md:hidden [&_button]:w-full">
          {save}
        </div>
      ) : null}
      <LeaveConfirm dirty={state.dirty} name={base.name} onDiscard={state.discard} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="@container">
      <h2 className="border-b border-border px-4 py-3.5 text-[15px] font-semibold sm:px-5">
        {title}
      </h2>
      <div className="flex flex-col gap-4 p-4 sm:p-5">{children}</div>
    </Card>
  )
}
