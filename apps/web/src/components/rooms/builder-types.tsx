// "Room types" in the builder: saved types as a quiet list, new ones as editable lines (name, code
// suggested from the name, bed, max guests). Details like size and amenities wait for the type's
// own sheet, so the first setup stays quick.
import type { RoomBed, RoomTypeView } from '@vento/shared'
import { Plus, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import type { DraftCheck, DraftType } from './builder-model'
import { BED_OPTIONS, bedLabel, toneAt } from './format'

type Props = {
  saved: readonly RoomTypeView[]
  drafts: readonly DraftType[]
  checks: ReadonlyMap<string, DraftCheck>
  onAdd: () => void
  onChange: (key: string, change: Partial<DraftType>) => void
  onRemove: (key: string) => void
}

const selectClass =
  'h-11 w-full rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:h-9 lg:text-base'

export function BuilderTypes({ saved, drafts, checks, onAdd, onChange, onRemove }: Props) {
  return (
    <Card>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h3 className="text-md font-semibold">Room types</h3>
          <p className="text-sm text-text-2">What you sell. Size and amenities can wait.</p>
        </div>
        <Button size="sm" className="max-lg:h-11" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          Add type
        </Button>
      </header>
      <ul className="divide-y divide-border">
        {saved.map((type, index) => (
          <li key={type.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <span
              aria-hidden="true"
              className={cn('size-2.5 flex-none rounded-[3px]', toneAt(index).swatch)}
            />
            <span className="min-w-0 grow truncate font-medium" title={type.name}>
              {type.name}
            </span>
            <span className="num text-sm text-text-3">{type.code}</span>
            <span className="text-sm whitespace-nowrap text-text-2 max-sm:hidden">
              {bedLabel(type)} · {type.maxGuests} guests
            </span>
          </li>
        ))}
        {drafts.map((draft, index) => (
          <DraftRow
            key={draft.key}
            draft={draft}
            number={index + 1}
            toneIndex={saved.length + index}
            check={checks.get(draft.key) ?? {}}
            onChange={(change) => onChange(draft.key, change)}
            onRemove={() => onRemove(draft.key)}
          />
        ))}
      </ul>
    </Card>
  )
}

function DraftRow({
  draft,
  number,
  toneIndex,
  check,
  onChange,
  onRemove,
}: {
  draft: DraftType
  number: number
  toneIndex: number
  check: DraftCheck
  onChange: (change: Partial<DraftType>) => void
  onRemove: () => void
}) {
  const id = `type-${draft.key}`
  // Problems show once something's typed; an empty new line isn't an error yet.
  const show = draft.name.trim() !== ''
  const problem = show ? (check.name ?? check.code ?? check.guests) : undefined
  const label = draft.name.trim() || `new type ${number}`
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:px-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-2.5 gap-y-2 sm:grid-cols-[auto_minmax(0,2fr)_88px_minmax(0,1fr)_auto_72px_auto]">
        <span
          aria-hidden="true"
          className={cn('mb-4 size-2.5 rounded-[3px] lg:mb-3.5', toneAt(toneIndex).swatch)}
        />
        <Labelled label="Name" htmlFor={`${id}-name`}>
          <Input
            id={`${id}-name`}
            value={draft.name}
            maxLength={60}
            placeholder="e.g. Deluxe King"
            aria-invalid={show && check.name ? true : undefined}
            onChange={(event) => onChange({ name: event.target.value })}
            className="max-lg:h-11"
          />
        </Labelled>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="grid size-11 place-items-center rounded-sm text-text-3 hover:bg-surface-2 hover:text-text sm:order-last lg:size-9"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <div className="col-span-3 grid grid-cols-[88px_minmax(0,1fr)] gap-2.5 sm:contents">
          <Labelled label="Code" htmlFor={`${id}-code`}>
            <Input
              id={`${id}-code`}
              value={draft.code}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={show && check.code ? true : undefined}
              onChange={(event) => onChange({ code: event.target.value.toUpperCase() })}
              className="num uppercase max-lg:h-11"
            />
          </Labelled>
          <Labelled label="Bed" htmlFor={`${id}-bed`}>
            <select
              id={`${id}-bed`}
              value={draft.bed}
              onChange={(event) => onChange({ bed: event.target.value as RoomBed })}
              className={selectClass}
            >
              {BED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Labelled>
        </div>
        <div className="col-span-3 grid grid-cols-2 items-end gap-2.5 sm:contents">
          <label
            htmlFor={`${id}-sofa`}
            className="flex h-11 items-center gap-2 text-sm text-text-2 lg:h-9"
          >
            <Checkbox
              id={`${id}-sofa`}
              checked={draft.sofaBed}
              onChange={(e) => onChange({ sofaBed: e.target.checked })}
            />
            Sofa bed
          </label>
          <Labelled label="Max guests" htmlFor={`${id}-guests`}>
            <Input
              id={`${id}-guests`}
              value={draft.guests}
              inputMode="numeric"
              maxLength={2}
              aria-invalid={show && check.guests ? true : undefined}
              onChange={(event) => onChange({ guests: event.target.value })}
              className="num max-lg:h-11"
            />
          </Labelled>
        </div>
      </div>
      {problem ? (
        <p className="text-sm text-ro sm:pl-5" aria-live="polite">
          {problem}
        </p>
      ) : null}
    </li>
  )
}

export function Labelled({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-text-3">
        {label}
      </label>
      {children}
    </div>
  )
}
