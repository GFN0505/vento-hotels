// Connecting rooms: type a room number to link it (both rooms then show it), remove with ×.

import type { ConnectingRoom } from '@vento/shared'
import { Link2, X } from 'lucide-react'
import { type KeyboardEvent, useId, useState } from 'react'
import { Input } from '@/components/ui/field'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'

type Props = {
  propertyId: string
  // The room being edited, which can't connect to itself.
  self: string | undefined
  value: readonly ConnectingRoom[]
  onChange: (value: ConnectingRoom[]) => void
}

export function ConnectingPicker({ propertyId, self, value, onChange }: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string>()
  const [finding, setFinding] = useState(false)

  async function add() {
    const number = text.trim().toUpperCase()
    if (!number) return
    if (value.length >= 4) return setProblem('Up to 4 connecting rooms')
    if (value.some((room) => room.number === number)) return setText('')
    setFinding(true)
    try {
      const found = await api.rooms.list({ propertyId, q: number, pageSize: 10 })
      const room = found.items.find((r) => r.number === number)
      if (!room) setProblem(`There's no room ${number} at this hotel.`)
      else if (room.id === self) setProblem("A room can't connect to itself.")
      else {
        onChange([...value, { id: room.id, number: room.number }])
        setText('')
        setProblem(undefined)
      }
    } catch (error) {
      setProblem(problemMessage(error))
    } finally {
      setFinding(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void add()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-text-2">
        Connecting rooms
      </label>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Connecting rooms chosen">
          {value.map((room) => (
            <li
              key={room.id}
              className="num inline-flex h-8 items-center gap-1.5 rounded-full bg-bl-bg pr-1 pl-2.5 text-sm font-semibold text-bl max-lg:h-11"
            >
              <Link2 className="size-3.5" aria-hidden="true" />
              {room.number}
              <button
                type="button"
                aria-label={`Remove connecting room ${room.number}`}
                onClick={() => onChange(value.filter((r) => r.id !== room.id))}
                className="grid size-6 place-items-center rounded-full hover:bg-bl-dot/20 max-lg:size-9"
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
          maxLength={10}
          placeholder="e.g. 402"
          autoCapitalize="characters"
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setText(event.target.value)
            setProblem(undefined)
          }}
          onKeyDown={onKeyDown}
          className="num max-w-40 max-lg:h-11"
        />
        <button
          type="button"
          aria-label="Add connecting room"
          disabled={!text.trim() || finding}
          onClick={() => void add()}
          className="h-9 flex-none rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-45 max-lg:h-11"
        >
          Add
        </button>
      </div>
      <p
        id={`${id}-hint`}
        className={problem ? 'text-sm text-ro' : 'text-sm text-text-3'}
        aria-live="polite"
      >
        {problem ?? 'The other room shows this one as connecting too.'}
      </p>
    </div>
  )
}
