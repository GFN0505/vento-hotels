// A labelled native select. Native on purpose: phones show their own picker, and it works with
// the keyboard and screen readers without extra code. A problem from submitting (`error`) shows
// in place of the hint until the choice changes.
import { type ReactNode, type SelectHTMLAttributes, useEffect, useId, useState } from 'react'
import { cn } from '@/lib/cn'

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hint?: ReactNode
  error?: string | undefined
  // Plain strings are both value and label.
  options: readonly (string | { value: string; label: string })[]
  placeholder?: string
}

export function SelectField({
  label,
  hint,
  error,
  options,
  placeholder,
  id,
  className,
  onChange,
  ...props
}: SelectFieldProps) {
  const generated = useId()
  const selectId = id ?? generated
  const hintId = `${selectId}-hint`
  const [changedSinceError, setChangedSinceError] = useState(false)
  useEffect(() => {
    if (error) setChangedSinceError(false)
  }, [error])
  const shown = error && !changedSinceError ? error : undefined
  const message = shown ?? hint
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-text-2">
        {label}
      </label>
      <select
        id={selectId}
        aria-describedby={message ? hintId : undefined}
        aria-invalid={shown ? true : undefined}
        className={cn(
          'h-11 w-full rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text lg:text-[15px]',
          'focus:border-ring focus-visible:outline-none focus:ring-3 focus:ring-pri-line',
          'aria-invalid:border-ro-dot aria-invalid:ring-3 aria-invalid:ring-ro-bg',
          'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-2',
          className,
        )}
        onChange={(event) => {
          setChangedSinceError(true)
          onChange?.(event)
        }}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => {
          const { value, label: text } =
            typeof option === 'string' ? { value: option, label: option } : option
          return (
            <option key={value} value={value}>
              {text}
            </option>
          )
        })}
      </select>
      {shown ? (
        <p id={hintId} className="text-sm text-ro" aria-live="polite">
          {shown}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
