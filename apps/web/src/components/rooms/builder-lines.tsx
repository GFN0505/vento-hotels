// "Rooms" in the builder: one line per block, "type · floors · numbers on each floor". Floor 4 with
// 01–14 makes 401–414; floor 0 is the ground floor (G01).
import { roomNumberFor } from '@vento/shared'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import type { Line, LineCheck, TypeOption } from './builder-model'
import { Labelled } from './builder-types'
import { plural, toneAt } from './format'

type Props = {
  lines: readonly Line[]
  options: readonly TypeOption[]
  checks: ReadonlyMap<string, LineCheck>
  notes: ReadonlyMap<string, string>
  onAdd: () => void
  onChange: (key: string, change: Partial<Line>) => void
  onRemove: (key: string) => void
}

export function BuilderLines({ lines, options, checks, notes, onAdd, onChange, onRemove }: Props) {
  return (
    <Card>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h3 className="text-md font-semibold">Rooms</h3>
          <p className="text-sm text-text-2">
            <span className="text-text-3">Example:</span> floor 4 with numbers 01–14 makes rooms
            401–414.
          </p>
        </div>
        <Button size="sm" className="max-lg:h-11" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          Add line
        </Button>
      </header>
      {lines.length === 0 ? (
        <p className="px-5 py-4 text-text-2">Add a line for each block of rooms.</p>
      ) : (
        <ol className="divide-y divide-border">
          {lines.map((line, index) => (
            <LineRow
              key={line.key}
              line={line}
              index={index}
              options={options}
              check={checks.get(line.key) ?? {}}
              note={notes.get(line.key)}
              onChange={(change) => onChange(line.key, change)}
              onRemove={() => onRemove(line.key)}
            />
          ))}
        </ol>
      )}
    </Card>
  )
}

const selectClass =
  'h-11 w-full rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none aria-invalid:border-ro-dot lg:h-9 lg:text-base'

function LineRow({
  line,
  index,
  options,
  check,
  note,
  onChange,
  onRemove,
}: {
  line: Line
  index: number
  options: readonly TypeOption[]
  check: LineCheck
  note: string | undefined
  onChange: (change: Partial<Line>) => void
  onRemove: () => void
}) {
  const id = `line-${line.key}`
  const tone = options.find((o) => o.key === line.typeKey)
  const value = check.value
  const count = value
    ? (value.floorTo - value.floorFrom + 1) * (value.numberTo - value.numberFrom + 1)
    : 0
  const problem = check.type ?? check.floors ?? check.numbers
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:px-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2.5 gap-y-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_96px_auto]">
        <Labelled label={`Line ${index + 1} · Room type`} htmlFor={`${id}-type`}>
          <div className="relative">
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute top-1/2 left-2.5 size-2.5 -translate-y-1/2 rounded-[3px]',
                tone ? toneAt(tone.toneIndex).swatch : 'bg-border-strong',
              )}
            />
            <select
              id={`${id}-type`}
              value={line.typeKey}
              aria-invalid={check.type ? true : undefined}
              onChange={(event) => onChange({ typeKey: event.target.value })}
              className={cn(selectClass, 'pl-7')}
            >
              <option value="">Choose a room type</option>
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </Labelled>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove line ${index + 1}`}
          className="grid size-11 place-items-center rounded-sm text-text-3 hover:bg-surface-2 hover:text-text md:order-last lg:size-9"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <div className="col-span-2 grid grid-cols-2 gap-2.5 md:contents">
          <Range
            legend="Floors"
            from={line.floorFrom}
            to={line.floorTo}
            fromLabel={`First floor, line ${index + 1}`}
            toLabel={`Last floor, line ${index + 1}`}
            invalid={Boolean(check.floors)}
            onChange={(from, to) => onChange({ floorFrom: from, floorTo: to })}
          />
          <Range
            legend="Numbers on each floor"
            from={line.numberFrom}
            to={line.numberTo}
            fromLabel={`First number, line ${index + 1}`}
            toLabel={`Last number, line ${index + 1}`}
            invalid={Boolean(check.numbers)}
            onChange={(from, to) => onChange({ numberFrom: from, numberTo: to })}
          />
        </div>
        <p className="col-span-2 flex h-9 items-center text-sm text-text-2 md:col-span-1 md:h-11 md:flex-col md:items-start md:justify-center lg:h-9">
          {value ? (
            <>
              <span className="num font-semibold text-text">{plural(count, 'room')}</span>
              <span className="num text-text-3 max-md:ml-2">
                {roomNumberFor(value.floorFrom, value.numberFrom)}–
                {roomNumberFor(value.floorTo, value.numberTo)}
              </span>
            </>
          ) : (
            <span className="text-text-3">No rooms yet</span>
          )}
        </p>
      </div>
      {problem ? (
        <p className="text-sm text-ro" aria-live="polite">
          {problem}
        </p>
      ) : note ? (
        <p className="flex items-center gap-1.5 text-sm text-am" aria-live="polite">
          <AlertTriangle className="size-3.5 flex-none" aria-hidden="true" />
          {note}
        </p>
      ) : null}
    </li>
  )
}

function Range({
  legend,
  from,
  to,
  fromLabel,
  toLabel,
  invalid,
  onChange,
}: {
  legend: string
  from: string
  to: string
  fromLabel: string
  toLabel: string
  invalid: boolean
  onChange: (from: string, to: string) => void
}) {
  const digits = (text: string) => text.replace(/\D/g, '').slice(0, 3)
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-text-3">{legend}</legend>
      <div className="flex items-center gap-1.5">
        <Input
          aria-label={fromLabel}
          value={from}
          inputMode="numeric"
          aria-invalid={invalid ? true : undefined}
          onChange={(event) => onChange(digits(event.target.value), to)}
          className="num min-w-0 text-center max-lg:h-11"
        />
        <span aria-hidden="true" className="text-text-3">
          –
        </span>
        <Input
          aria-label={toLabel}
          value={to}
          inputMode="numeric"
          aria-invalid={invalid ? true : undefined}
          onChange={(event) => onChange(from, digits(event.target.value))}
          className="num min-w-0 text-center max-lg:h-11"
        />
      </div>
    </fieldset>
  )
}
