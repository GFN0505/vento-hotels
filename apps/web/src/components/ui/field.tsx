// Labelled form field and input, matching `.field` and `.input` in the designs.
import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '@/lib/cn'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-sm border border-border-strong bg-surface px-2.5 text-base text-text placeholder:text-text-3',
        'focus:border-brand focus:outline-none focus:ring-3 focus:ring-pri-line',
        'aria-invalid:border-ro-dot aria-invalid:ring-3 aria-invalid:ring-ro-bg',
        className,
      )}
      {...props}
    />
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  error?: string | undefined
}

export function Field({ label, hint, error, id, ...props }: FieldProps) {
  const generated = useId()
  const inputId = id ?? generated
  const messageId = `${inputId}-message`
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-text-2">
        {label}
      </label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        {...props}
      />
      {error ? (
        <span id={messageId} className="text-sm text-ro">
          {error}
        </span>
      ) : hint ? (
        <span id={messageId} className="text-sm text-text-3">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
