// Street, area, state and LGA (spec: "Fields · Address"). The LGA comes from the chosen state's
// fixed list, and changing the state clears it. Nigeria only, so the country isn't asked.
import { isNigerianState, NIGERIAN_LGAS, NIGERIAN_STATES } from '@vento/shared'
import { Combobox } from '@/components/ui/combobox'
import { Field } from '@/components/ui/field'
import type { HotelForm, Problems } from './hotel-form-model'

type Props = {
  form: Pick<HotelForm, 'addressLine1' | 'area' | 'state' | 'lga'>
  problems: Problems
  readOnly?: boolean
  onChange: (change: Partial<HotelForm>) => void
}

const STATES = NIGERIAN_STATES.map((state) => ({ value: state, label: state }))

const required = (message: string) => (value: string) => (value.trim() ? undefined : message)

export function AddressFields({ form, problems, readOnly, onChange }: Props) {
  const lgas = isNigerianState(form.state)
    ? NIGERIAN_LGAS[form.state].map((lga) => ({ value: lga, label: lga }))
    : []
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Street"
        name="addressLine1"
        value={form.addressLine1}
        maxLength={200}
        autoComplete="address-line1"
        placeholder="e.g. Plot 1412 Ahmadu Bello Way"
        readOnly={readOnly}
        error={problems.addressLine1}
        validate={required('Enter the street')}
        onChange={(event) => onChange({ addressLine1: event.target.value })}
        className="max-lg:h-11"
      />
      <div className="grid gap-4 @md:grid-cols-3">
        <Field
          label="Area"
          name="area"
          value={form.area}
          maxLength={120}
          placeholder="e.g. Victoria Island"
          readOnly={readOnly}
          error={problems.area}
          validate={required('Enter the area')}
          onChange={(event) => onChange({ area: event.target.value })}
          className="max-lg:h-11"
        />
        <Combobox
          label="State"
          name="state"
          value={form.state}
          placeholder="Choose a state"
          options={STATES}
          readOnly={readOnly}
          error={problems.state}
          onChange={(state) => onChange({ state, lga: '' })}
        />
        <Combobox
          label="LGA"
          name="lga"
          value={form.lga}
          placeholder={form.state ? 'Choose an LGA' : 'Choose a state first'}
          options={lgas}
          disabled={!readOnly && !form.state}
          readOnly={readOnly}
          hint={form.state ? undefined : 'Choose a state first'}
          error={problems.lga}
          onChange={(lga) => onChange({ lga })}
        />
      </div>
    </div>
  )
}
