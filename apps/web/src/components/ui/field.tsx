// Labelled form field and input, matching `.field` and `.input` in the designs.
//
// Behaviour every form gets for free:
// - `validate` runs when the person moves on to another field, then again on each keystroke once a
//   problem is showing, so the message disappears the moment it's fixed. It doesn't run when they
//   tap a button or link: a message appearing then would push the button away mid-tap, and the
//   submit check covers it anyway.
// - An `error` from submitting shows until the person edits the field.
// - Password fields (`revealable`) have a show/hide button and warn when Caps Lock is on.
// - Text is 16px on phones, so iPhones don't zoom into the field on focus.
import { Eye, EyeOff } from 'lucide-react'
import {
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react'
import { cn } from '@/lib/cn'

// True when focus is going to another text field, not to a button, a link or nowhere.
export function movingToAnotherField(event: FocusEvent<HTMLElement>): boolean {
  const next = event.relatedTarget
  return (
    next instanceof HTMLInputElement &&
    next.type !== 'checkbox' &&
    next.type !== 'submit' &&
    next.type !== 'button'
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-sm border border-input bg-surface px-2.5 text-base text-text placeholder:text-text-3 max-sm:text-[16px]',
        'focus:border-ring focus-visible:outline-none focus:ring-3 focus:ring-pri-line',
        'aria-invalid:border-ro-dot aria-invalid:ring-3 aria-invalid:ring-ro-bg',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-2',
        className,
      )}
      {...props}
    />
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  // From the last submit; shown until the person edits the field.
  error?: string | undefined
  // Checked on leaving the field, then live while a problem shows.
  validate?: (value: string) => string | undefined
  // A positive note shown when there's no problem (e.g. "Passwords match").
  success?: string | undefined
  // Adds a show/hide button and a Caps Lock warning. Use for every password input.
  revealable?: boolean
}

export function Field({
  label,
  hint,
  error,
  validate,
  success,
  id,
  revealable,
  type,
  onBlur,
  onChange,
  onKeyDown,
  onKeyUp,
  'aria-describedby': describedBy,
  ...props
}: FieldProps) {
  const generated = useId()
  const inputId = id ?? generated
  const messageId = `${inputId}-message`
  const capsId = `${inputId}-caps`
  const [revealed, setRevealed] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [touched, setTouched] = useState(false)
  const [liveError, setLiveError] = useState<string>()
  const [editedSinceError, setEditedSinceError] = useState(false)

  // A new submit error shows again, even if the field was edited before.
  useEffect(() => {
    if (error) setEditedSinceError(false)
  }, [error])

  const shown = error && !editedSinceError ? error : touched ? liveError : undefined

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setCapsLock(false)
    if (movingToAnotherField(event)) {
      setTouched(true)
      if (validate) setLiveError(validate(event.currentTarget.value))
    }
    onBlur?.(event)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setEditedSinceError(true)
    if (validate && (touched || error)) {
      setTouched(true)
      setLiveError(validate(event.currentTarget.value))
    }
    onChange?.(event)
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    if (revealable) setCapsLock(event.getModifierState('CapsLock'))
  }

  const message = shown ?? success ?? hint
  const input = (
    <Input
      id={inputId}
      type={revealable && revealed ? 'text' : type}
      aria-invalid={shown ? true : undefined}
      aria-describedby={
        [message ? messageId : null, capsLock ? capsId : null, describedBy]
          .filter(Boolean)
          .join(' ') || undefined
      }
      className={revealable ? 'pr-12 lg:pr-10' : undefined}
      onBlur={handleBlur}
      onChange={handleChange}
      onKeyDown={(event) => {
        trackCapsLock(event)
        onKeyDown?.(event)
      }}
      onKeyUp={(event) => {
        trackCapsLock(event)
        onKeyUp?.(event)
      }}
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
            aria-label={`${revealed ? 'Hide' : 'Show'} ${/confirm/i.test(label) ? 'confirm password' : 'password'}`}
            aria-pressed={revealed}
            aria-controls={inputId}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-sm text-text-3 hover:text-text focus-visible:text-text focus-visible:outline-offset-[-2px] lg:w-9"
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      ) : (
        input
      )}
      {capsLock ? (
        <span id={capsId} className="text-sm font-medium text-am" role="status">
          Caps Lock is on
        </span>
      ) : null}
      {/* Messages are announced as they appear (screen readers hear them without moving focus). */}
      {shown ? (
        <span id={messageId} className="text-sm text-ro" aria-live="polite">
          {shown}
        </span>
      ) : success ? (
        <span id={messageId} className="text-sm text-em" aria-live="polite">
          {success}
        </span>
      ) : hint ? (
        <span id={messageId} className="text-sm text-text-3">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
