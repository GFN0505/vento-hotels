// The bar that opens above the preview for one room: its type, or leave it out.
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PlannedChip, TypeOption } from './builder-model'

const LEAVE_OUT = 'leave-out'

export function ChipEditor({
  chip,
  options,
  onChange,
  onDone,
}: {
  chip: PlannedChip
  options: readonly TypeOption[]
  onChange: (typeKey: string | null) => void
  onDone: () => void
}) {
  const id = `chip-${chip.number}`
  const blocked = chip.taken
    ? chip.taken === 'archived'
      ? `Room ${chip.number} is archived. Restore it from the Archived filter.`
      : `Room ${chip.number} already exists, so it's skipped.`
    : chip.duplicate
      ? `Room ${chip.number} is in two lines. Change one of them.`
      : undefined
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-pri-soft/40 px-4 py-2.5 sm:px-5"
      aria-live="polite"
    >
      <span className="num font-semibold">Room {chip.number}</span>
      {blocked ? (
        <span className="grow text-sm text-text-2">{blocked}</span>
      ) : (
        <span className="flex grow items-center gap-2">
          <label htmlFor={id} className="text-sm text-text-2">
            Type
          </label>
          <select
            id={id}
            value={chip.typeKey ?? LEAVE_OUT}
            onChange={(event) =>
              onChange(event.target.value === LEAVE_OUT ? null : event.target.value)
            }
            className="h-11 min-w-0 rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:h-8 lg:text-base"
          >
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
              </option>
            ))}
            <option value={LEAVE_OUT}>Leave it out</option>
          </select>
        </span>
      )}
      <Button size="sm" className="max-lg:h-11" onClick={onDone}>
        <Check className="size-4" aria-hidden="true" />
        Done
      </Button>
    </div>
  )
}
