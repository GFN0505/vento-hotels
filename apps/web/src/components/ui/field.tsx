// Labelled form field and input, matching `.field` and `.input` in the designs.
import { Eye, EyeOff } from 'lucide-react'
import { type InputHTMLAttributes, type ReactNode, useId, useState } from 'react'
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
  // Adds a show/hide button. Use for every password input.
  revealable?: boolean
}

export function Field({ label, hint, error, id, revealable, type, ...props }: FieldProps) {
  const generated = useId()
  const inputId = id ?? generated
  const messageId = `${inputId}-message`
  const [revealed, setRevealed] = useState(false)

  const input = (
    <Input
      id={inputId}
      type={revealable && revealed ? 'text' : type}
      aria-invalid={error ? true : undefined}
      aria-describedby={error || hint ? messageId : undefined}
      className={revealable ? 'pr-10' : undefined}
      {...props}
    />
  )

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-text-2">
        {label}
      </label>
      {revealable ? (
        <div className="relative">
          {input}
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            aria-controls={inputId}
            className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-sm text-text-3 hover:text-text focus-visible:text-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-pri-line"
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      ) : (
        input
      )}
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
