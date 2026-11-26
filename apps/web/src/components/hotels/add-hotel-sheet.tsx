// Add a hotel (spec: user flow B): name, owning company, address and times; the time zone under
// below the times, with Change. The new hotel appears in the hotel switch at once and the top bar moves to it,
// where its settings show the next steps.
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { CompanySheet } from '@/components/companies/company-sheet'
import { NEEDS_CONNECTION } from '@/components/settings/offline-note'
import { useProperty } from '@/components/shell/property-context'
import { Button } from '@/components/ui/button'
import { useDiscardGuard } from '@/components/ui/discard-guard'
import { Field } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { api } from '@/lib/api'
import { errorCode, problemMessage } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import { useOnline } from '@/offline/connection'
import { AddressFields } from './address-fields'
import { CompanySelect, defaultCompany } from './company-select'
import { timeZoneLabel } from './format'
import * as F from './hotel-form-model'
import { rememberAdded } from './next-steps-store'
import { useActiveCompanies, useSetupRefresh } from './queries'
import { TimeFields, TimeZoneField } from './time-fields'

// "Africa/Lagos (WAT)"
function zoneShort(timeZone: string): string {
  const [zone, name] = timeZoneLabel(timeZone).split(' · ')
  return name ? `${zone} (${name})` : timeZone
}

const FIELD_FOR_CODE: Record<string, keyof F.HotelForm> = {
  NAME_TAKEN: 'name',
  NAME_ARCHIVED: 'name',
  ENTITY_ARCHIVED: 'entityId',
  ENTITY_NOT_FOUND: 'entityId',
}

export function AddHotelSheet({ onClose }: { onClose: () => void }) {
  const formId = useId()
  const online = useOnline()
  const refresh = useSetupRefresh()
  const { select } = useProperty()
  const companies = useActiveCompanies()
  const active = companies.data?.items ?? []
  const [typed, setForm] = useState(() => F.emptyForm(''))
  // The company that owns the most hotels, until another is chosen.
  const form = { ...typed, entityId: typed.entityId || defaultCompany(active) }
  const [problems, setProblems] = useState<F.Problems>({})
  const [more, setMore] = useState(false)
  const [addingCompany, setAddingCompany] = useState(false)
  const dirty = JSON.stringify({ ...typed, entityId: '' }) !== JSON.stringify(F.emptyForm(''))
  const guard = useDiscardGuard(dirty, onClose)
  const set = (change: Partial<F.HotelForm>) => setForm((f) => ({ ...f, ...change }))

  const add = useMutation({
    mutationFn: () => {
      const { reason: _, ...fields } = form
      return api.properties.create({
        ...fields,
        name: form.name.trim(),
        addressLine1: form.addressLine1.trim(),
        area: form.area.trim(),
      })
    },
    onSuccess: async (hotel) => {
      rememberAdded(hotel.id)
      // The switch must know the hotel before it can move to it.
      await refresh()
      onClose()
      select(hotel.id, { moveFocus: true })
      toast.success(`${hotel.name} added`)
    },
    onError: (error) => {
      const field = FIELD_FOR_CODE[errorCode(error) ?? ''] ?? 'form'
      setProblems({ [field]: problemMessage(error) })
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = F.checkNew(form)
    setProblems(found)
    if (found.timeZone) setMore(true)
    if (Object.keys(found).length > 0) {
      return focusFirstProblem(event.currentTarget, F.FIELD_ORDER, found)
    }
    add.mutate()
  }

  return (
    <Sheet
      open
      onClose={() => (add.isPending ? undefined : guard.close())}
      title="Add a hotel"
      description="It joins the hotel switch straight away."
      footer={
        guard.bar ?? (
          <>
            <span className="grow" />
            {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
            <Button onClick={guard.close} disabled={add.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              disabled={!online}
              loading={add.isPending}
            >
              Add hotel
            </Button>
          </>
        )
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="@container flex flex-col gap-5">
        {problems.form ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {problems.form}
          </p>
        ) : null}
        <Field
          label="Hotel name"
          name="name"
          value={form.name}
          maxLength={120}
          placeholder="e.g. Kora Lekki"
          error={problems.name}
          validate={(value) =>
            value.trim().length < 2 ? 'Enter at least 2 characters' : undefined
          }
          onChange={(event) => set({ name: event.target.value })}
          className="max-lg:h-11"
          data-autofocus
        />
        <CompanySelect
          value={form.entityId}
          companies={active}
          error={problems.entityId}
          onChange={(entityId) => set({ entityId })}
          onAddCompany={() => setAddingCompany(true)}
        />
        <AddressFields form={form} problems={problems} onChange={set} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeFields form={form} problems={problems} onChange={set} />
        </div>
        {more ? (
          <TimeZoneField
            value={form.timeZone}
            live={false}
            error={problems.timeZone}
            onChange={(timeZone) => set({ timeZone })}
          />
        ) : (
          <p className="flex flex-wrap items-center gap-x-2 text-text-2">
            <span>
              Time zone: <span className="text-text">{zoneShort(form.timeZone)}</span>
            </span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-label="Change time zone"
              className="inline-flex min-h-11 items-center font-medium text-pri-ink hover:underline lg:min-h-0"
            >
              Change
            </button>
          </p>
        )}
      </form>
      {addingCompany ? (
        <CompanySheet
          onClose={() => setAddingCompany(false)}
          onCreated={(company) => set({ entityId: company.id })}
        />
      ) : null}
    </Sheet>
  )
}
