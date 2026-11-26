// A Yes / No choice as two joined buttons (real radio inputs, so arrows, Space and screen readers
// work as usual). For settings where both answers are common and a checkbox would hide "No".
import { useId } from 'react'
import { cn } from '@/lib/cn'

type Props = {
  label: string
  hint?: string
  value: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}

export function YesNo({ label, hint, value, disabled, onChange }: Props) {
  const name = useId()
  const hintId = `${name}-hint`
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-1.5"
      aria-describedby={hint ? hintId : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium text-text-2">{label}</legend>
      <div className="inline-flex w-fit rounded-sm border border-input bg-surface-2 p-0.5">
        {[true, false].map((option) => (
          <label
            key={String(option)}
            className={cn(
              'relative flex h-11 min-w-16 cursor-pointer items-center justify-center rounded-[6px] px-4 font-medium text-text-2 lg:h-8',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
              value === option && 'bg-pri-soft text-pri-ink shadow-card ring-1 ring-pri-line',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === option}
              disabled={disabled}
              onChange={() => onChange(option)}
            />
            {option ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-text-3">
          {hint}
        </p>
      ) : null}
    </fieldset>
  )
}
