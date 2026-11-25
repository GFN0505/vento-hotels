// Design: 24 · Sign in (and · Wrong password, · Signing in).
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AuthCard, AuthFootnote } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmailField } from '@/components/ui/email-field'
import { Field } from '@/components/ui/field'
import { authClient } from '@/lib/auth'
import { emailProblem } from '@/lib/email'
import { CANT_REACH_VENTO, isConnectionProblem } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/sign-in')({
  // Already signed in: go straight home.
  beforeLoad: async () => {
    const { data } = await authClient.getSession()
    if (data) throw redirect({ to: '/' })
  },
  component: SignIn,
})

// Matches the sign-in limit set in the API (apps/api/src/auth/auth.ts).
const PAUSE_MINUTES = 10

function messageFor(code: string | undefined, status: number): string {
  if (status === 429) {
    return `Too many sign-in attempts. For your security, wait ${PAUSE_MINUTES} minutes, then try again.`
  }
  if (code === 'EMAIL_NOT_VERIFIED') {
    return 'Confirm your email first. We sent you a link when you signed up.'
  }
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'INVALID_EMAIL')
    return 'Invalid email or password'
  return "We couldn't sign you in. Check your connection and try again."
}

function SignIn() {
  usePageTitle('Sign in')
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string | undefined
    password?: string | undefined
  }>({})

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    const errors = {
      ...(emailProblem(email) ? { email: emailProblem(email) } : {}),
      ...(password === '' ? { password: 'Enter your password.' } : {}),
    }
    setFieldErrors(errors)
    setError(undefined)
    if (Object.keys(errors).length > 0) {
      focusFirstProblem(formElement, ['email', 'password'], errors)
      return
    }
    setPending(true)
    const { error: failure } = await authClient.signIn.email({
      email,
      password,
      rememberMe: form.get('remember') === 'on',
    })
    setPending(false)
    if (failure) {
      setError(
        isConnectionProblem(failure) ? CANT_REACH_VENTO : messageFor(failure.code, failure.status),
      )
      return
    }
    await navigate({ to: '/' })
  }

  return (
    <AuthCard title="Sign in" subtitle="Use your work email.">
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate>
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        <EmailField autoComplete="username" autoFocus error={fieldErrors.email} />
        <div className="flex flex-col gap-1.5">
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            revealable
            error={fieldErrors.password}
          />
          <Link
            to="/forgot-password"
            className="self-start text-[13px] text-pri-ink hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <hr className="border-border" />
        <label htmlFor="remember" className="flex cursor-pointer items-start gap-2.5">
          <Checkbox id="remember" name="remember" className="mt-0.5" />
          <span className="flex flex-col">
            <span className="font-medium">Keep me signed in on this device</span>
            <span className="text-sm text-text-2">
              30 days. Don't tick this on a shared computer.
            </span>
          </span>
        </label>
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
        <AuthFootnote>
          New to Vento? <Link to="/get-started">Set up your hotel group</Link>
        </AuthFootnote>
      </form>
    </AuthCard>
  )
}
