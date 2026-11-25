// Onboarding step 1 (design 19): the owner creates their account, then confirms their email.
import { createFileRoute, Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { authClient } from '@/lib/auth'
import { checkNewPassword, MIN_PASSWORD_LENGTH } from '@/lib/password'

export const Route = createFileRoute('/get-started')({
  component: GetStarted,
})

type Errors = { name?: string; email?: string; password?: string; confirm?: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(name: string, email: string, password: string, confirm: string): Errors {
  const errors: Errors = checkNewPassword(password, confirm)
  if (name.length < 2) errors.name = 'Enter your full name.'
  if (!EMAIL.test(email)) errors.email = 'Enter a valid email, like ada@yourhotel.com.'
  return errors
}

function GetStarted() {
  const [sentTo, setSentTo] = useState<string>()
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name')).trim()
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    const errors = validate(name, email, password, String(form.get('confirm')))
    setFieldErrors(errors)
    setError(undefined)
    if (Object.keys(errors).length > 0) return

    setPending(true)
    const { error: failure } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: `${window.location.origin}/setup`,
    })
    setPending(false)
    if (failure) {
      setError(
        failure.code === 'USER_ALREADY_EXISTS' ||
          failure.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
          ? 'There is already an account with this email. Sign in instead.'
          : failure.code === 'PASSWORD_TOO_SHORT'
            ? `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`
            : "We couldn't create your account. Check the details and try again.",
      )
      return
    }
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your inbox" subtitle={`We sent a link to ${sentTo}.`}>
        <p className="text-text-2">
          Open it to confirm your email, then set up your hotel group. Not there? Check spam.
        </p>
        <Link to="/sign-in" className="text-pri-ink hover:underline">
          Back to sign in
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Set up your hotel group" subtitle="Takes about 5 minutes.">
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate>
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          required
          autoFocus
          error={fieldErrors.name}
        />
        <Field
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          error={fieldErrors.email}
        />
        <Field
          label="Create a password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          revealable
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={fieldErrors.password}
        />
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          revealable
          error={fieldErrors.confirm}
        />
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? 'Creating your account…' : 'Create account'}
        </Button>
        <span className="text-sm text-text-2">
          Already using Vento?{' '}
          <Link to="/sign-in" className="text-pri-ink hover:underline">
            Sign in
          </Link>
        </span>
      </form>
    </AuthCard>
  )
}
