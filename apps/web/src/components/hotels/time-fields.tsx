// Check-in from, check-out by and the time zone (spec: "Fields"). Times are 24-hour in 5-minute
// steps; a check-out later than check-in (serviced apartments) is fine. The time zone is fixed once
// a hotel is live.

import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { Field } from '@/components/ui/field'
import { timeZoneLabel } from './format'
import type { HotelForm, Problems } from './hotel-form-model'

const TIME = /^([01]\d|2[0-3]):[0-5][05]$/
const timeProblem = (value: string) =>
  TIME.test(value) ? undefined : 'Use 24-hour time in 5-minute steps, like 14:00'

type TimesProps = {
  form: Pick<HotelForm, 'checkInTime' | 'checkOutTime'>
  problems: Problems
  readOnly?: boolean
  onChange: (change: Partial<HotelForm>) => void
}

export function TimeFields({ form, problems, readOnly, onChange }: TimesProps) {
  return (
    <>
      <Field
        label="Check-in from"
        name="checkInTime"
        type="time"
        step={300}
        value={form.checkInTime}
        readOnly={readOnly}
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
        readOnly={readOnly}
        error={problems.checkOutTime}
        validate={timeProblem}
        onChange={(event) => onChange({ checkOutTime: event.target.value })}
        className="num max-lg:h-11"
      />
    </>
  )
}

// Where Nigerian groups' hotels and guests usually are, first; then every IANA zone the browser
// knows, labelled once and kept for the visit.
export const COMMON_ZONES = [
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Europe/London',
  'Asia/Dubai',
]

let zones: ComboOption[] | undefined

function zoneOptions(current: string): ComboOption[] {
  zones ??= [
    ...COMMON_ZONES.map((zone) => ({ value: zone, label: timeZoneLabel(zone), group: 'Common' })),
    ...Intl.supportedValuesOf('timeZone')
      .filter((zone) => !COMMON_ZONES.includes(zone))
      .map((zone) => ({ value: zone, label: timeZoneLabel(zone), group: 'All time zones' })),
  ]
  return zones.some((zone) => zone.value === current)
    ? zones
    : [{ value: current, label: timeZoneLabel(current) }, ...zones]
}

export function TimeZoneField({
  value,
  live,
  readOnly,
  error,
  onChange,
}: {
  value: string
  live: boolean
  readOnly?: boolean
  error?: string | undefined
  onChange: (timeZone: string) => void
}) {
  return (
    <Combobox
      label="Time zone"
      name="timeZone"
      value={value}
      options={zoneOptions(value)}
      readOnly={readOnly || live}
      hint={live ? 'The time zone is fixed once a hotel is live.' : undefined}
      error={error}
      onChange={onChange}
    />
  )
}
