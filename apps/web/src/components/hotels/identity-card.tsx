// Identity (design #25 SetProperty): logo, hotel name and owning company. A live hotel's move to
// another company waits for the next business date and asks why; until then it shows with
// "Cancel change". A company missing its RC number or TIN says so, with "Edit company".
import { addDays } from '@vento/shared'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CompanySheet } from '@/components/companies/company-sheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { REASON_HINT, ReasonDialog, reasonProblem } from '@/components/ui/reason-dialog'
import { COMPANY_HINT, CompanySelect } from './company-select'
import { dateLabel } from './format'
import { needsReason } from './hotel-form-model'
import { LogoField } from './logo-field'
import { useActiveCompanies } from './queries'
import type { HotelFormState } from './use-hotel-form'

type Props = {
  state: HotelFormState
  canManage: boolean
  online: boolean
}

export function IdentityCard({ state, canManage, online }: Props) {
  const { base: hotel, form, problems, set } = state
  const companies = useActiveCompanies()
  const [sheet, setSheet] = useState<'add' | 'edit'>()
  const active = companies.data?.items ?? []
  const owner = active.find((company) => company.id === hotel.entityId)
  const locked = !canManage || !online
  const asking = needsReason(hotel, form)

  return (
    <Card>
      <h2 className="border-b border-border px-4 py-3.5 text-[15px] font-semibold sm:px-5">
        Identity
      </h2>
      <div className="flex flex-col gap-5 p-4 sm:p-5">
        <LogoField hotel={hotel} canChange={canManage} online={online} onChange={state.setLogo} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Hotel name"
            name="name"
            value={form.name}
            maxLength={120}
            readOnly={locked}
            error={problems.name}
            onChange={(event) => set({ name: event.target.value })}
            className="max-lg:h-11"
          />
          <div className="flex min-w-0 flex-col gap-2">
            {canManage ? (
              <CompanySelect
                value={form.entityId}
                companies={active}
                fallback={{ id: hotel.entityId, name: hotel.entityName }}
                readOnly={locked}
                error={problems.entityId}
                hint={COMPANY_HINT}
                onChange={(entityId) => set({ entityId, reason: '' })}
                onAddCompany={() => setSheet('add')}
              />
            ) : (
              <Field
                label="Owning company"
                value={hotel.entityName}
                readOnly
                hint={COMPANY_HINT}
                className="max-lg:h-11"
              />
            )}
            <CompanyNote
              state={state}
              canManage={canManage}
              online={online}
              onEdit={() => setSheet('edit')}
              canEdit={Boolean(owner)}
            />
          </div>
        </div>
        {asking ? (
          <Field
            label="Reason for changing the owning company"
            name="reason"
            value={form.reason}
            maxLength={500}
            hint={
              form.entityId === hotel.entityId
                ? `${hotel.name} stays with ${hotel.entityName}. ${REASON_HINT}`
                : `Applies from ${dateLabel(addDays(hotel.businessDate, 1))}, the next business date. ${REASON_HINT}`
            }
            error={problems.reason}
            validate={reasonProblem}
            onChange={(event) => set({ reason: event.target.value })}
            className="max-lg:h-11"
          />
        ) : null}
      </div>
      {/* Outside the hotel's form in the page, so the two forms never nest. */}
      {sheet === 'add'
        ? createPortal(
            <CompanySheet
              onClose={() => setSheet(undefined)}
              onCreated={(company) => set({ entityId: company.id, reason: '' })}
            />,
            document.body,
          )
        : null}
      {sheet === 'edit' && owner
        ? createPortal(
            <CompanySheet company={owner} onClose={() => setSheet(undefined)} />,
            document.body,
          )
        : null}
    </Card>
  )
}

function CompanyNote({
  state,
  canManage,
  online,
  canEdit,
  onEdit,
}: Props & { canEdit: boolean; onEdit: () => void }) {
  const hotel = state.base
  const pending = hotel.pendingEntity
  const [asking, setAsking] = useState(false)
  if (pending) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-bl-bg px-3 py-2 text-sm text-bl">
        <span className="grow">
          {pending.name} from {dateLabel(pending.from)}
        </span>
        {canManage ? (
          <Button
            size="sm"
            className="max-lg:h-11"
            disabled={!online}
            onClick={() => setAsking(true)}
          >
            Cancel change
          </Button>
        ) : null}
        {asking
          ? createPortal(
              <ReasonDialog
                open
                title={`Keep ${hotel.name} with ${hotel.entityName}?`}
                description={`The move to ${pending.name} from ${dateLabel(pending.from)} is cancelled.`}
                label="Reason for cancelling the change"
                confirmLabel="Cancel change"
                pending={state.cancelling}
                error={state.problems.form}
                onConfirm={(reason) => state.cancelChange(reason, () => setAsking(false))}
                onClose={() => setAsking(false)}
              />,
              document.body,
            )
          : null}
      </div>
    )
  }
  if (!hotel.entityDetailsMissing && !canManage) return null
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {hotel.entityDetailsMissing ? (
        <span className="grow text-am">{hotel.entityName} · RC number and TIN missing</span>
      ) : (
        <span className="grow" />
      )}
      {canManage && canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center font-medium text-pri-ink hover:underline lg:min-h-0"
        >
          Edit company
        </button>
      ) : null}
    </p>
  )
}
