// Onboarding step 1 (design 19): the owner creates their account, then confirms their email.

import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { isStrongPassword } from '@vento/shared'
import { type FormEvent, useEffect, useState } from 'react'
import { AuthCard, AuthFootnote } from '@/components/auth-card'
import { PasswordRules } from '@/components/password-rules'
import { Button } from '@/components/ui/button'
import { EmailField } from '@/components/ui/email-field'
import { Field } from '@/components/ui/field'
import { authClient } from '@/lib/auth'
import { emailProblem } from '@/lib/email'
import { CANT_REACH_VENTO, isConnectionProblem } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import { checkNewPassword } from '@/lib/password'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/get-started')({
  // Already signed in: go straight home.
  beforeLoad: async () => {
    const { data } = await authClient.getSession()
    if (data) throw redirect({ to: '/' })
  },
  component: GetStarted,
})

type Errors = {
  name?: string | undefined
  email?: string | undefined
  password?: string | undefined
  confirm?: string | undefined
}

const nameProblem = (value: string) =>
  value.trim().length < 2 ? 'Enter your full name.' : undefined

function GetStarted() {
  const [sentTo, setSentTo] = useState<string>()
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  usePageTitle(sentTo ? 'Check your inbox' : 'Set up your hotel group')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('name')).trim()
    const email = String(form.get('email')).trim()
    const errors: Errors = {
      ...checkNewPassword(newPassword, confirm),
      ...(nameProblem(name) ? { name: nameProblem(name) } : {}),
      ...(emailProblem(email) ? { email: emailProblem(email) } : {}),
    }
    setFieldErrors(errors)
    setError(undefined)
    if (Object.keys(errors).length > 0) {
      focusFirstProblem(formElement, ['name', 'email', 'password', 'confirm'], errors)
      return
    }

    setPending(true)
    const { error: failure } = await authClient.signUp.email({
      name,
      email,
      password: newPassword,
      callbackURL: `${window.location.origin}/setup`,
    })
    setPending(false)
    if (failure) {
      setError(
        isConnectionProblem(failure)
          ? CANT_REACH_VENTO
          : failure.code === 'USER_ALREADY_EXISTS' ||
              failure.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
            ? 'There is already an account with this email. Sign in instead.'
            : failure.code === 'PASSWORD_TOO_WEAK' || failure.code === 'PASSWORD_TOO_SHORT'
              ? "Your password doesn't meet every rule yet."
              : failure.status === 429
                ? 'Too many attempts from this network. Wait a few minutes, then try again.'
                : "We couldn't create your account. Check the details and try again.",
      )
      return
    }
    setSentTo(email)
  }

  if (sentTo) {
    return <CheckInbox email={sentTo} onStartAgain={() => setSentTo(undefined)} />
  }

  const passwordsMatch =
    confirm.length > 0 && confirm === newPassword && isStrongPassword(newPassword)

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
          autoCapitalize="words"
          maxLength={80}
          required
          autoFocus
          validate={nameProblem}
          error={fieldErrors.name}
        />
        <EmailField autoComplete="email" error={fieldErrors.email} />
        <Field
          label="Create a password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          revealable
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-describedby={newPassword || fieldErrors.password ? 'password-rules' : undefined}
          error={fieldErrors.password}
        />
        {/* The checklist appears once they start typing, not before. */}
        {newPassword || fieldErrors.password ? (
          <PasswordRules id="password-rules" password={newPassword} />
        ) : null}
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          revealable
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          validate={(value) =>
            value.length > 0 && value !== newPassword
              ? "Passwords don't match. Type it again."
              : undefined
          }
          success={passwordsMatch ? 'Passwords match' : undefined}
          error={fieldErrors.confirm}
        />
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {pending ? 'Creating your account…' : 'Create account'}
        </Button>
        <AuthFootnote>
          Already using Vento? <Link to="/sign-in">Sign in</Link>
        </AuthFootnote>
      </form>
    </AuthCard>
  )
}

const RESEND_AFTER_SECONDS = 60

// After sign-up: where the link went, a way to send it again, and a way out if the address was wrong.
function CheckInbox({ email, onStartAgain }: { email: string; onStartAgain: () => void }) {
  const [wait, setWait] = useState(RESEND_AFTER_SECONDS)
  const [note, setNote] = useState<string>()
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function resend() {
    setSending(true)
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: `${window.location.origin}/setup`,
    })
    setSending(false)
    setNote(
      isConnectionProblem(error)
        ? CANT_REACH_VENTO
        : error
          ? "We couldn't send it just now. Try again in a minute."
          : 'Sent again. It can take a minute to arrive.',
    )
    setWait(RESEND_AFTER_SECONDS)
  }

  return (
    <AuthCard title="Check your inbox" subtitle={`We sent a link to ${email}.`}>
      <p className="text-text-2">
        Open it to confirm your email, then set up your hotel group. Not there? Check spam.
      </p>
      {note ? (
        <p className="text-text-2" role="status">
          {note}
        </p>
      ) : null}
      <Button variant="default" size="lg" onClick={resend} loading={sending} disabled={wait > 0}>
        {wait > 0 ? `Resend email in 0:${String(wait).padStart(2, '0')}` : 'Resend email'}
      </Button>
      <AuthFootnote>
        Wrong email?{' '}
        <button type="button" onClick={onStartAgain}>
          Start again
        </button>{' '}
        · <Link to="/sign-in">Back to sign in</Link>
      </AuthFootnote>
    </AuthCard>
  )
}
