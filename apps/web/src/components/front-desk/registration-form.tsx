// The guest registration form (design #6 CheckIn "Registration card" and "Foreign national
// registration"), shared by the check-in sheet and the walk-in page. Required fields come from the
// rule set in force; optional ones sit under More details. The foreign national section opens by
// itself for a nationality other than Nigerian. Numbers are shown as typed while typing; a
// returning guest's number stays on the server ("Same NIN as last stay · ••••••6612 · Change").
import {
  GUEST_TITLES,
  ID_TYPE_LABELS,
  isEcowas,
  NIGERIAN_STATES,
  PORT_OF_ENTRY_LABELS,
  PORTS_OF_ENTRY,
  VISA_TYPE_LABELS,
  VISA_TYPES,
  VISIT_PURPOSE_LABELS,
  VISIT_PURPOSES,
} from '@vento/shared'
import { ChevronDown, Globe2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Pills } from '@/components/reservations/change-parts'
import { useCountries } from '@/components/reservations/use-countries'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import {
  type RegistrationForm as Form,
  foreignShown,
  idTypesFor,
  problemsOf,
  type Rules,
  requiredFor,
  withNationality,
} from './registration-model'

type Props = {
  form: Form
  onChange: (form: Form) => void
  rules: Rules
  // After a submit: show every problem, not only the fields already left.
  showErrors: boolean
  // "From her stay on 14 Oct 2026 at Kora Ikeja GRA"
  reusedFrom?: string | undefined
  idPrefix: string
  compact?: boolean
}

export function RegistrationFields({
  form,
  onChange,
  rules,
  showErrors,
  reusedFrom,
  idPrefix,
  compact = false,
}: Props) {
  const countries = useCountries()
  const [more, setMore] = useState(false)
  const moreId = useId()
  const required = requiredFor(rules, form)
  const problems = problemsOf(form, rules)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => onChange({ ...form, [key]: value })
  const check = (key: keyof Form) => (value: string) =>
    problemsOf({ ...form, [key]: value } as Form, rules)[key]
  const err = (key: keyof Form) => (showErrors ? problems[key] : undefined)
  const label = (text: string, field: Parameters<typeof required.has>[0]) =>
    required.has(field) ? text : `${text} (optional)`
  const countryOptions = (countries ?? []).map((c) => ({ value: c.code, label: c.name }))
  const nationalityOptions = (countries ?? []).map((c) => ({ value: c.code, label: c.demonym }))
  const foreign = foreignShown(form)
  const id = (name: string) => `${idPrefix}-${name}`
  const grid = compact ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className="flex flex-col gap-4">
      <div className={grid}>
        {form.lead ? (
          <SelectField
            id={id('title')}
            label={label('Title', 'title')}
            value={form.title}
            placeholder="–"
            options={GUEST_TITLES}
            onChange={(event) => set('title', event.target.value)}
          />
        ) : null}
        <Field
          id={id('first')}
          label="First name"
          value={form.firstName}
          autoComplete="off"
          error={err('firstName')}
          validate={check('firstName')}
          onChange={(event) => set('firstName', event.target.value)}
        />
        <Field
          id={id('last')}
          label="Last name"
          value={form.lastName}
          autoComplete="off"
          error={err('lastName')}
          validate={check('lastName')}
          onChange={(event) => set('lastName', event.target.value)}
        />
        <SelectField
          id={id('nationality')}
          label="Nationality"
          value={form.nationality}
          options={
            nationalityOptions.length
              ? nationalityOptions
              : [{ value: form.nationality, label: form.nationality }]
          }
          onChange={(event) => onChange(withNationality(form, event.target.value))}
        />
        {form.lead || foreign ? (
          <SelectField
            id={id('id-type')}
            label={foreign ? 'Travel document' : label('ID type', 'id_type')}
            value={form.idType}
            placeholder="Pick the ID type"
            error={err('idType')}
            options={idTypesFor(form.nationality).map((value) => ({
              value,
              label: ID_TYPE_LABELS[value],
            }))}
            onChange={(event) => set('idType', event.target.value as Form['idType'])}
          />
        ) : null}
        {form.lead || foreign ? (
          form.reuseFrom && !form.idNumber ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-text-2">
                {form.idType ? `${ID_TYPE_LABELS[form.idType]} number` : 'ID number'}
              </span>
              <div className="flex h-11 items-center justify-between gap-2 rounded-sm border border-input bg-surface-2 px-2.5 lg:h-9">
                <span className="num truncate">Same as last stay · {form.reusedMasked}</span>
                <button
                  type="button"
                  className="text-sm font-medium text-pri-ink hover:underline"
                  onClick={() => onChange({ ...form, reuseFrom: '', reusedMasked: '' })}
                >
                  Change
                </button>
              </div>
              {reusedFrom ? <span className="text-sm text-text-3">{reusedFrom}</span> : null}
            </div>
          ) : (
            <Field
              id={id('id-number')}
              label={form.idType ? `${ID_TYPE_LABELS[form.idType]} number` : 'ID number'}
              value={form.idNumber}
              inputMode={form.idType === 'nin' ? 'numeric' : 'text'}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="num"
              hint={form.idType === 'nin' ? 'e.g. 12345678901' : 'e.g. A01234567'}
              error={err('idNumber')}
              validate={check('idNumber')}
              onChange={(event) => set('idNumber', event.target.value)}
            />
          )
        ) : null}
      </div>

      {form.lead ? (
        <div className={grid}>
          <div className={compact ? 'sm:col-span-2' : 'sm:col-span-2 lg:col-span-3'}>
            <Field
              id={id('address')}
              label={label('Home address', 'address')}
              value={form.addressLine}
              autoComplete="street-address"
              hint="e.g. 12 Allen Avenue"
              error={err('addressLine')}
              validate={check('addressLine')}
              onChange={(event) => set('addressLine', event.target.value)}
            />
          </div>
          <Field
            id={id('city')}
            label="Town or city"
            value={form.addressCity}
            autoComplete="address-level2"
            hint="e.g. Ikeja"
            onChange={(event) => set('addressCity', event.target.value)}
          />
          {form.addressCountry === 'NG' ? (
            <SelectField
              id={id('region')}
              label="State (optional)"
              value={form.addressRegion}
              placeholder="–"
              options={NIGERIAN_STATES}
              onChange={(event) => set('addressRegion', event.target.value)}
            />
          ) : (
            <Field
              id={id('region')}
              label="State or region (optional)"
              value={form.addressRegion}
              autoComplete="address-level1"
              onChange={(event) => set('addressRegion', event.target.value)}
            />
          )}
          <SelectField
            id={id('country')}
            label="Country"
            value={form.addressCountry}
            options={
              countryOptions.length
                ? countryOptions
                : [{ value: form.addressCountry, label: form.addressCountry }]
            }
            onChange={(event) => set('addressCountry', event.target.value)}
          />
        </div>
      ) : null}

      {foreign ? (
        <section
          aria-labelledby={id('foreign-title')}
          className="rounded-md border border-border bg-surface shadow-card"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 id={id('foreign-title')} className="flex items-center gap-2 font-semibold">
              <Globe2 className="size-4 text-pri-ink" aria-hidden="true" />
              Foreign national registration
            </h3>
            <span className="text-sm text-text-2">Required because nationality isn't Nigerian</span>
          </header>
          <div className={`${grid} px-4 py-4`}>
            <SelectField
              id={id('id-country')}
              label={label('Issuing country', 'id_country')}
              value={form.idCountry}
              placeholder="–"
              error={err('idCountry')}
              options={countryOptions}
              onChange={(event) => set('idCountry', event.target.value)}
            />
            <Field
              id={id('id-expiry')}
              type="date"
              label={label('Passport expiry', 'id_expiry')}
              value={form.idExpiry}
              error={err('idExpiry')}
              validate={check('idExpiry')}
              onChange={(event) => set('idExpiry', event.target.value)}
            />
            <Field
              id={id('occupation')}
              label={label('Occupation', 'occupation')}
              value={form.occupation}
              hint="e.g. Engineer"
              error={err('occupation')}
              validate={check('occupation')}
              onChange={(event) => set('occupation', event.target.value)}
            />
            <SelectField
              id={id('visa')}
              label={label('Visa or permit', 'visa_type')}
              value={form.visaType}
              placeholder="Pick the visa or permit"
              error={err('visaType')}
              options={VISA_TYPES.filter(
                (type) => type !== 'not_required' || isEcowas(form.nationality),
              ).map((value) => ({ value, label: VISA_TYPE_LABELS[value] }))}
              onChange={(event) => set('visaType', event.target.value as Form['visaType'])}
            />
            {form.visaType === 'other' ? (
              <Field
                id={id('visa-text')}
                label="Which visa or permit"
                value={form.visaTypeText}
                error={err('visaTypeText')}
                onChange={(event) => set('visaTypeText', event.target.value)}
              />
            ) : null}
            {form.visaType !== 'not_required' ? (
              <>
                <Field
                  id={id('visa-number')}
                  label={label('Visa or permit number', 'visa_number')}
                  value={form.visaNumber}
                  autoComplete="off"
                  spellCheck={false}
                  className="num"
                  error={err('visaNumber')}
                  validate={check('visaNumber')}
                  onChange={(event) => set('visaNumber', event.target.value)}
                />
                <Field
                  id={id('visa-until')}
                  type="date"
                  label={label('Valid until', 'visa_valid_until')}
                  value={form.visaValidUntil}
                  error={err('visaValidUntil')}
                  validate={check('visaValidUntil')}
                  onChange={(event) => set('visaValidUntil', event.target.value)}
                />
              </>
            ) : null}
            <Field
              id={id('entry')}
              type="date"
              label={label('Date of entry to Nigeria', 'entry_date')}
              value={form.entryDate}
              onChange={(event) => set('entryDate', event.target.value)}
            />
            <SelectField
              id={id('port')}
              label={label('Port of entry', 'port_of_entry')}
              value={form.portOfEntry}
              placeholder="–"
              options={PORTS_OF_ENTRY.map((value) => ({
                value,
                label: PORT_OF_ENTRY_LABELS[value],
              }))}
              onChange={(event) => set('portOfEntry', event.target.value as Form['portOfEntry'])}
            />
            {form.portOfEntry === 'other' ? (
              <Field
                id={id('port-text')}
                label="Which port"
                value={form.portOfEntryText}
                onChange={(event) => set('portOfEntryText', event.target.value)}
              />
            ) : null}
            <Field
              id={id('from')}
              label={label('Arriving from', 'arriving_from')}
              value={form.arrivingFrom}
              hint="e.g. Accra"
              error={err('arrivingFrom')}
              validate={check('arrivingFrom')}
              onChange={(event) => set('arrivingFrom', event.target.value)}
            />
            <Field
              id={id('next')}
              label={label('Next destination', 'next_destination')}
              value={form.nextDestination}
              hint="e.g. Abuja"
              error={err('nextDestination')}
              validate={check('nextDestination')}
              onChange={(event) => set('nextDestination', event.target.value)}
            />
          </div>
        </section>
      ) : null}

      {form.lead ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={more}
            aria-controls={moreId}
            onClick={() => setMore((open) => !open)}
            className="inline-flex h-11 w-fit items-center gap-1.5 text-sm font-medium text-pri-ink hover:underline lg:h-8"
          >
            <ChevronDown
              className={
                more ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'
              }
              aria-hidden="true"
            />
            More details
          </button>
          {more ? (
            <div id={moreId} className={grid}>
              <Field
                id={id('dob')}
                type="date"
                label={label('Date of birth', 'date_of_birth')}
                value={form.dateOfBirth}
                onChange={(event) => set('dateOfBirth', event.target.value)}
              />
              <Field
                id={id('plate')}
                label={label('Vehicle plate', 'vehicle_plate')}
                value={form.vehiclePlate}
                hint="e.g. LND 482 KJ"
                autoCapitalize="characters"
                onChange={(event) => set('vehiclePlate', event.target.value)}
              />
              <div className={compact ? 'sm:col-span-2' : 'sm:col-span-2 lg:col-span-3'}>
                <Pills
                  legend={label('Purpose of visit', 'purpose')}
                  name={id('purpose')}
                  options={VISIT_PURPOSES.map((value) => ({
                    value,
                    label: VISIT_PURPOSE_LABELS[value],
                  }))}
                  value={form.purpose || undefined}
                  onChange={(value) => set('purpose', value)}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
