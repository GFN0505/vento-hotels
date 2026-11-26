// A few joined choices (`.seg` in the designs), e.g. "Derived from a parent plan" / "Own prices" or
// "Keep as they are" / "On" / "Off". Real radio inputs, so arrows, Space and screen readers work.
import { useId } from 'react'
import { cn } from '@/lib/cn'

type Option<T extends string> = { value: T; label: string; disabled?: boolean }

type Props<T extends string> = {
  label: string
  // Visually hidden label, when a heading above already says it.
  hideLabel?: boolean
  hint?: string | undefined
  value: T
  options: readonly Option<T>[]
  disabled?: boolean
  onChange: (value: T) => void
}

export function Segmented<T extends string>({
  label,
  hideLabel,
  hint,
  value,
  options,
  disabled,
  onChange,
}: Props<T>) {
  const name = useId()
  const hintId = `${name}-hint`
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-1.5"
      aria-describedby={hint ? hintId : undefined}
    >
      <legend className={cn('mb-1.5 text-sm font-medium text-text-2', hideLabel && 'sr-only')}>
        {label}
      </legend>
      <div className="inline-flex w-fit max-w-full flex-wrap rounded-sm border border-input bg-surface-2 p-0.5">
        {options.map((option) => {
          const off = disabled || option.disabled
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex h-11 cursor-pointer items-center justify-center rounded-[6px] px-3 font-medium text-text-2 lg:h-8',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                value === option.value &&
                  'bg-pri-soft text-pri-ink shadow-card ring-1 ring-pri-line',
                off && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                // Over the whole choice, invisible: a tap anywhere on it is a tap on the radio.
                className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                checked={value === option.value}
                disabled={off}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          )
        })}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-text-3">
          {hint}
        </p>
      ) : null}
    </fieldset>
  )
}
