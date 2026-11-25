// A labelled native select. Native on purpose: phones show their own picker, and it works with
// the keyboard and screen readers without extra code.
import { type SelectHTMLAttributes, useId } from 'react'
import { cn } from '@/lib/cn'

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hint?: string
  options: readonly string[]
  placeholder?: string
}

export function SelectField({
  label,
  hint,
  options,
  placeholder,
  id,
  className,
  ...props
}: SelectFieldProps) {
  const generated = useId()
  const selectId = id ?? generated
  const hintId = `${selectId}-hint`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-text-2">
        {label}
      </label>
      <select
        id={selectId}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          'h-11 w-full rounded-sm border border-input bg-surface px-2.5 text-[16px] text-text lg:text-[15px]',
          'focus:border-ring focus-visible:outline-none focus:ring-3 focus:ring-pri-line',
          className,
        )}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="text-sm text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
