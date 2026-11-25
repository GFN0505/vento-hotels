// Onboarding step 1 (design 19): the owner creates their account, then confirms their email.
import { createFileRoute, Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { authClient } from '@/lib/auth'

export const Route = createFileRoute('/get-started')({
  component: GetStarted,
})

function GetStarted() {
  const [sentTo, setSentTo] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    setPending(true)
    setError(undefined)
    const { error: failure } = await authClient.signUp.email({
      name: String(form.get('name')),
      email,
      password: String(form.get('password')),
      callbackURL: `${window.location.origin}/setup`,
    })
    setPending(false)
    if (failure) {
      setError(
        failure.code === 'PASSWORD_TOO_SHORT'
          ? 'Use at least 10 characters for your password.'
          : failure.code === 'USER_ALREADY_EXISTS'
            ? 'There is already an account with this email. Sign in instead.'
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
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        <Field label="Full name" name="name" autoComplete="name" required minLength={2} />
        <Field label="Work email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Create a password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          hint="At least 10 characters."
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
