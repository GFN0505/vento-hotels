// "Reason for the difference": required for any difference, 5–200 characters, with a few
// suggestions to tap. Recorded with the person's name (and the approver's).
import { cn } from '@/lib/cn'

type Props = {
  id: string
  value: string
  suggestions: readonly string[]
  hint: string
  error?: string | undefined
  disabled?: boolean
  onChange: (value: string) => void
}

export function ReasonField({ id, value, suggestions, hint, error, disabled, onChange }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-2">
        Reason for the difference
      </label>
      <textarea
        id={id}
        name="reason"
        rows={2}
        maxLength={200}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-message`}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'w-full rounded-sm border border-input bg-surface px-2.5 py-2 text-[16px] lg:text-base',
          'focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none',
          'aria-invalid:border-ro-dot aria-invalid:ring-3 aria-invalid:ring-ro-bg disabled:bg-surface-2',
        )}
      />
      <span id={`${id}-message`} className={cn('text-sm', error ? 'text-ro' : 'text-text-3')}>
        {error ?? hint}
      </span>
      {disabled ? null : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Suggestions">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => onChange(suggestion)}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface-2 px-3 text-left text-sm text-text-2 hover:text-text lg:min-h-8"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
