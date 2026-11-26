// The builder's preview: every planned room as a chip coloured by its type, floor by floor, with
// a legend. Click (or arrow to) a chip to change its type or leave it out. Numbers the hotel already
// has are struck through and skipped; numbers two lines both make are marked until fixed.
import { AlertTriangle, Ban, LayoutGrid } from 'lucide-react'
import { type KeyboardEvent, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import type { PlannedChip, TypeOption } from './builder-model'
import { ChipEditor } from './chip-editor'
import { floorName, toneAt } from './format'

type Props = {
  chips: readonly PlannedChip[]
  options: readonly TypeOption[]
  takenCount: number
  leftOut: number
  onChip: (number: string, typeKey: string | null | undefined) => void
}

function chipState(chip: PlannedChip): string {
  if (chip.duplicate) return 'in two lines'
  if (chip.taken === 'archived') return 'already exists, archived'
  if (chip.taken) return 'already exists'
  if (!chip.typeKey) return 'left out'
  return ''
}

export function BuilderPreview({ chips, options, takenCount, leftOut, onChip }: Props) {
  const [selected, setSelected] = useState<string>()
  const [focusIndex, setFocusIndex] = useState(0)
  const grid = useRef<HTMLDivElement>(null)
  const byKey = new Map(options.map((option) => [option.key, option]))
  const floors = [...new Set(chips.map((chip) => chip.floor))]
  const counts = new Map<string, number>()
  for (const chip of chips) {
    if (chip.typeKey && !chip.taken && !chip.duplicate) {
      counts.set(chip.typeKey, (counts.get(chip.typeKey) ?? 0) + 1)
    }
  }
  const current = chips.find((chip) => chip.number === selected)

  // One tab stop for the whole grid; arrows move between rooms (UX standard: keyboard).
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    }
    let next = focusIndex
    if (event.key in moves) next = focusIndex + (moves[event.key] ?? 0)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = chips.length - 1
    else return
    event.preventDefault()
    next = Math.max(0, Math.min(chips.length - 1, next))
    setFocusIndex(next)
    grid.current?.querySelectorAll<HTMLButtonElement>('[data-chip]')[next]?.focus()
  }

  let index = -1
  return (
    <Card className="flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h3 className="text-md font-semibold">Preview</h3>
          <p className="text-sm text-text-2">Click a room to change its type or leave it out.</p>
        </div>
        <ul
          className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-text-2"
          aria-label="Rooms by type"
        >
          {options
            .filter((option) => counts.get(option.key))
            .map((option) => (
              <li key={option.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn('size-2.5 rounded-[3px]', toneAt(option.toneIndex).swatch)}
                />
                {option.name}{' '}
                <span className="num font-semibold text-text">{counts.get(option.key)}</span>
              </li>
            ))}
          {takenCount ? (
            <li className="flex items-center gap-1.5 text-text-2">
              <Ban className="size-3.5 text-text-3" aria-hidden="true" />
              Skipped: {takenCount} already {takenCount === 1 ? 'exists' : 'exist'}
            </li>
          ) : null}
          {leftOut ? <li className="text-text-3">{leftOut} left out</li> : null}
        </ul>
      </header>
      {current ? (
        <ChipEditor
          chip={current}
          options={options}
          onChange={(typeKey) => onChip(current.number, typeKey)}
          onDone={() => setSelected(undefined)}
        />
      ) : null}
      {chips.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-text-2">
          <LayoutGrid className="size-6 text-text-3" aria-hidden="true" strokeWidth={1.7} />
          Your rooms show here, floor by floor, as you fill in the lines.
        </div>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: a group of room buttons with arrow-key moves.
        <div
          ref={grid}
          role="group"
          aria-label="Planned rooms"
          onKeyDown={onKeyDown}
          className="flex flex-col gap-2 p-4 sm:p-5"
        >
          {floors.map((floor) => (
            <div key={floor} className="flex items-start gap-3">
              <span className="num w-14 flex-none pt-2.5 text-xs font-medium text-text-3 lg:pt-1.5">
                {floorName(floor).replace(' floor', '')}
              </span>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {chips
                  .filter((chip) => chip.floor === floor)
                  .map((chip) => {
                    index++
                    const option = chip.typeKey ? byKey.get(chip.typeKey) : undefined
                    const state = chipState(chip)
                    const mine = index
                    return (
                      <button
                        key={`${chip.number}-${mine}`}
                        type="button"
                        data-chip
                        tabIndex={mine === Math.min(focusIndex, chips.length - 1) ? 0 : -1}
                        aria-pressed={selected === chip.number}
                        title={
                          state
                            ? `${chip.number}: ${state}`
                            : `${chip.number}: ${option?.name ?? ''}`
                        }
                        onFocus={() => setFocusIndex(mine)}
                        onClick={() =>
                          setSelected((s) => (s === chip.number ? undefined : chip.number))
                        }
                        className={cn(
                          'num flex h-11 w-[64px] flex-col items-center justify-center rounded-sm ring-1 transition-[box-shadow,transform] ring-inset active:scale-95',
                          chip.duplicate
                            ? 'bg-ro-bg text-ro ring-2 ring-ro-dot'
                            : chip.taken
                              ? 'bg-surface-2 text-text-2 ring-border-strong'
                              : option
                                ? toneAt(option.toneIndex).chip
                                : 'border border-dashed border-border-strong bg-transparent text-text-3 ring-0',
                          selected === chip.number &&
                            'ring-2 ring-pri ring-offset-2 ring-offset-surface',
                        )}
                      >
                        <span className="sr-only">
                          Room {chip.number}, {state || option?.name || 'no type'}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-[13px] leading-4 font-semibold lg:text-xs"
                        >
                          {chip.number}
                        </span>
                        <span
                          aria-hidden="true"
                          className="flex items-center gap-0.5 text-[10px] leading-3 font-medium"
                        >
                          {chip.duplicate ? (
                            <>
                              <AlertTriangle className="size-2.5" aria-hidden="true" />
                              Twice
                            </>
                          ) : chip.taken ? (
                            <>
                              <Ban className="size-2.5" aria-hidden="true" />
                              Exists
                            </>
                          ) : option ? (
                            option.code
                          ) : (
                            'Out'
                          )}
                        </span>
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
