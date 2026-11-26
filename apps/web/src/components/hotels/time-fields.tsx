// Check-in from, check-out by and the time zone (spec: "Fields"). Times are 24-hour in 5-minute
// steps; a check-out later than check-in (serviced apartments) is fine. The time zone is fixed once
// a hotel is live.
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { timeZoneLabel } from './format'
import type { HotelForm, Problems } from './hotel-form-model'

const TIME = /^([01]\d|2[0-3]):[0-5][05]$/
const timeProblem = (value: string) =>
  TIME.test(value) ? undefined : 'Use 24-hour time in 5-minute steps, like 14:00'

type TimesProps = {
  form: Pick<HotelForm, 'checkInTime' | 'checkOutTime'>
  problems: Problems
  disabled?: boolean
  onChange: (change: Partial<HotelForm>) => void
}

export function TimeFields({ form, problems, disabled, onChange }: TimesProps) {
  return (
    <>
      <Field
        label="Check-in from"
        name="checkInTime"
        type="time"
        step={300}
        value={form.checkInTime}
        disabled={disabled}
        error={problems.checkInTime}
        validate={timeProblem}
        onChange={(event) => onChange({ checkInTime: event.target.value })}
        className="num max-lg:h-11"
      />
      <Field
        label="Check-out by"
        name="checkOutTime"
        type="time"
        step={300}
        value={form.checkOutTime}
        disabled={disabled}
        error={problems.checkOutTime}
        validate={timeProblem}
        onChange={(event) => onChange({ checkOutTime: event.target.value })}
        className="num max-lg:h-11"
      />
    </>
  )
}

let zones: { value: string; label: string }[] | undefined

// Every IANA zone the browser knows, labelled once and kept for the visit.
function zoneOptions(current: string) {
  zones ??= Intl.supportedValuesOf('timeZone').map((zone) => ({
    value: zone,
    label: timeZoneLabel(zone),
  }))
  return zones.some((zone) => zone.value === current)
    ? zones
    : [{ value: current, label: timeZoneLabel(current) }, ...zones]
}

export function TimeZoneField({
  value,
  live,
  disabled,
  error,
  onChange,
}: {
  value: string
  live: boolean
  disabled?: boolean
  error?: string | undefined
  onChange: (timeZone: string) => void
}) {
  return (
    <SelectField
      label="Time zone"
      name="timeZone"
      value={value}
      options={zoneOptions(value)}
      disabled={disabled || live}
      hint={live ? 'The time zone is fixed once a hotel is live.' : undefined}
      error={error}
      onChange={(event) => onChange(event.target.value)}
      className="lg:h-9 lg:text-base"
    />
  )
}
