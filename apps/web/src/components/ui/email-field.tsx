// Email field for sign-up and sign-in: the right keyboard on phones (no capitals, no autocorrect),
// checked on leaving the field, and a one-tap fix for common typos ("Did you mean ada@gmail.com?").
import { useId, useState } from 'react'
import { emailProblem, suggestEmail } from '@/lib/email'
import { Field, movingToAnotherField } from './field'

type EmailFieldProps = {
  label?: string
  name?: string
  // 'username' on sign-in, so password managers fill and save it; 'email' on sign-up.
  autoComplete: 'username' | 'email'
  error?: string | undefined
  autoFocus?: boolean
}

export function EmailField({
  label = 'Work email',
  name = 'email',
  autoComplete,
  error,
  autoFocus,
}: EmailFieldProps) {
  const [value, setValue] = useState('')
  const [suggestion, setSuggestion] = useState<string>()
  const inputId = useId()
  const suggestionId = `${inputId}-suggestion`

  return (
    <div className="flex flex-col gap-1.5">
      <Field
        id={inputId}
        label={label}
        name={name}
        aria-describedby={suggestion ? suggestionId : undefined}
        type="email"
        inputMode="email"
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setSuggestion(undefined)
        }}
        onBlur={(event) => {
          // Same rule as validation: only when moving on to another field, so nothing shifts
          // under a tap on the submit button.
          if (movingToAnotherField(event)) setSuggestion(suggestEmail(event.currentTarget.value))
        }}
        validate={emailProblem}
        error={error}
      />
      {suggestion ? (
        <p id={suggestionId} className="text-[13px] text-text-2" role="status">
          Did you mean{' '}
          <button
            type="button"
            className="font-medium text-pri-ink underline-offset-4 hover:underline"
            onClick={() => {
              setValue(suggestion)
              setSuggestion(undefined)
              // Back to the field, so keyboard and screen-reader users carry on where they were.
              document.getElementById(inputId)?.focus()
            }}
          >
            {suggestion}
          </button>
          ?
        </p>
      ) : null}
    </div>
  )
}
