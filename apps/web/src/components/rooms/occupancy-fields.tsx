// "Who it sleeps" on the room type sheet: base occupancy, max adults and children, and the max
// guests they add up to.
import { Field } from '@/components/ui/field'
import * as F from './room-type-form'

type Props = {
  form: F.TypeForm
  problems: Record<string, string | undefined>
  onChange: (change: Partial<F.TypeForm>) => void
}

export function OccupancyFields({ form, problems, onChange }: Props) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">Who it sleeps</legend>
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Base occupancy"
          name="baseOccupancy"
          value={form.baseOccupancy}
          error={problems.baseOccupancy}
          validate={F.countProblem(1, 'guests')}
          onChange={(v) => onChange({ baseOccupancy: v })}
        />
        <NumberField
          label="Max adults"
          name="maxAdults"
          value={form.maxAdults}
          error={problems.maxAdults}
          validate={F.countProblem(1, 'adults')}
          onChange={(v) => onChange({ maxAdults: v })}
        />
        <NumberField
          label="Max children"
          name="maxChildren"
          value={form.maxChildren}
          error={problems.maxChildren}
          validate={F.countProblem(0, 'children')}
          onChange={(v) => onChange({ maxChildren: v })}
        />
      </div>
      <p className="text-sm text-text-3">
        Base occupancy is how many guests the price includes. Max guests:{' '}
        <span className="num font-medium text-text-2">
          {(Number(form.maxAdults) || 0) + (Number(form.maxChildren) || 0)}
        </span>
      </p>
    </fieldset>
  )
}

function NumberField(props: {
  label: string
  name: string
  value: string
  error: string | undefined
  validate: (value: string) => string | undefined
  onChange: (value: string) => void
}) {
  return (
    <Field
      label={props.label}
      name={props.name}
      value={props.value}
      inputMode="numeric"
      maxLength={2}
      error={props.error}
      validate={props.validate}
      onChange={(event) => props.onChange(event.target.value.replace(/\D/g, ''))}
      className="num"
    />
  )
}
