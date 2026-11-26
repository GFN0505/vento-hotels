// Street, area, state and LGA (spec: "Fields · Address"). The LGA comes from the chosen state's
// fixed list, and changing the state clears it. Nigeria only, so the country isn't asked.
import { isNigerianState, NIGERIAN_LGAS, NIGERIAN_STATES } from '@vento/shared'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import type { HotelForm, Problems } from './hotel-form-model'

type Props = {
  form: Pick<HotelForm, 'addressLine1' | 'area' | 'state' | 'lga'>
  problems: Problems
  disabled?: boolean
  onChange: (change: Partial<HotelForm>) => void
}

const required = (message: string) => (value: string) => (value.trim() ? undefined : message)

export function AddressFields({ form, problems, disabled, onChange }: Props) {
  const lgas = isNigerianState(form.state) ? NIGERIAN_LGAS[form.state] : []
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Street"
        name="addressLine1"
        value={form.addressLine1}
        maxLength={200}
        autoComplete="address-line1"
        placeholder="e.g. Plot 1412 Ahmadu Bello Way"
        disabled={disabled}
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
          disabled={disabled}
          error={problems.area}
          validate={required('Enter the area')}
          onChange={(event) => onChange({ area: event.target.value })}
          className="max-lg:h-11"
        />
        <SelectField
          label="State"
          name="state"
          value={form.state}
          placeholder="Choose a state"
          options={NIGERIAN_STATES}
          disabled={disabled}
          error={problems.state}
          onChange={(event) => onChange({ state: event.target.value, lga: '' })}
          className="lg:h-9 lg:text-base"
        />
        <SelectField
          label="LGA"
          name="lga"
          value={form.lga}
          placeholder={form.state ? 'Choose an LGA' : 'Choose a state first'}
          options={lgas}
          disabled={disabled || !form.state}
          hint={form.state ? undefined : 'Choose a state first'}
          error={problems.lga}
          onChange={(event) => onChange({ lga: event.target.value })}
          className="lg:h-9 lg:text-base"
        />
      </div>
    </div>
  )
}
