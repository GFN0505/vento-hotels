// Chips for a short list of words (a room's features, a type's amenities): the chosen ones with a
// remove button, one-tap suggestions, and a field for the hotel's own words (Enter adds).
import { Plus, X } from 'lucide-react'
import { type KeyboardEvent, useId, useState } from 'react'
import { Input } from '@/components/ui/field'

type Props = {
  label: string
  value: readonly string[]
  suggestions: readonly string[]
  onChange: (value: string[]) => void
  max?: number
  placeholder?: string
}

export function ChipInput({
  label,
  value,
  suggestions,
  onChange,
  max = 30,
  placeholder = 'e.g. Roll-in shower',
}: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const has = (word: string) => value.some((v) => v.toLowerCase() === word.toLowerCase())
  const offered = suggestions.filter((word) => !has(word))

  function add(word: string) {
    const clean = word.trim().replace(/\s+/g, ' ').slice(0, 40)
    if (clean && !has(clean) && value.length < max) onChange([...value, clean])
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(text)
      setText('')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-text-2">
        {label}
      </label>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label} chosen`}>
          {value.map((word) => (
            <li
              key={word}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-pri-soft pr-1 pl-3 text-sm font-medium text-pri-ink max-lg:h-11"
            >
              {word}
              <button
                type="button"
                aria-label={`Remove ${word}`}
                onClick={() => onChange(value.filter((v) => v !== word))}
                className="grid size-6 place-items-center rounded-full hover:bg-pri-line/60 max-lg:size-9"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          maxLength={40}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          className="max-lg:h-11"
        />
        <button
          type="button"
          aria-label={`Add to ${label.toLowerCase()}`}
          disabled={!text.trim()}
          onClick={() => {
            add(text)
            setText('')
          }}
          className="h-9 flex-none rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-45 max-lg:h-11"
        >
          Add
        </button>
      </div>
      {offered.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Suggestions">
          {offered.map((word) => (
            <li key={word}>
              <button
                type="button"
                onClick={() => add(word)}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 text-sm text-text-2 hover:border-pri-line hover:bg-pri-soft/50 hover:text-pri-ink max-lg:h-11"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                {word}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
