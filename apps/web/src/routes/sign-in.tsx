// Design: 24 · Sign in (and · Wrong password, · Signing in).
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { authClient } from '@/lib/auth'

export const Route = createFileRoute('/sign-in')({
  component: SignIn,
})

function messageFor(code: string | undefined): string {
  if (code === 'EMAIL_NOT_VERIFIED') {
    return 'Confirm your email first. We sent you a link when you signed up.'
  }
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'INVALID_EMAIL')
    return 'Invalid email or password'
  return "We couldn't sign you in. Check your connection and try again."
}

function SignIn() {
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(undefined)
    const { error: failure } = await authClient.signIn.email({
      email: String(form.get('email')).trim(),
      password: String(form.get('password')),
      rememberMe: form.get('remember') === 'on',
    })
    setPending(false)
    if (failure) {
      setError(messageFor(failure.code))
      return
    }
    await navigate({ to: '/' })
  }

  return (
    <AuthCard title="Sign in">
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate>
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        <Field
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
        <div className="flex flex-col gap-1.5">
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            revealable
          />
          <Link to="/forgot-password" className="self-end text-sm text-pri-ink hover:underline">
            Forgot password?
          </Link>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="remember" defaultChecked className="accent-pri" />
          Keep me signed in on this computer
        </label>
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
        <hr className="border-border" />
        <span className="text-sm text-text-2">
          On a shared tablet or phone? Staff sign in with their PIN on the device lock screen.
        </span>
        <span className="text-sm text-text-2">
          New to Vento?{' '}
          <Link to="/get-started" className="text-pri-ink hover:underline">
            Set up your hotel group
          </Link>
        </span>
      </form>
    </AuthCard>
  )
}
