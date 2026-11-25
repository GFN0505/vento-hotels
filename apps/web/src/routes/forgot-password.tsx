// Design: 24 · Forgot password and · Reset link sent.
import { createFileRoute, Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { authClient } from '@/lib/auth'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPassword,
})

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ForgotPassword() {
  const [sent, setSent] = useState<{ to: string; expiresAt: string }>()
  const [emailError, setEmailError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email')).trim()
    if (!EMAIL.test(email)) {
      setEmailError('Enter a valid email, like ada@yourhotel.com.')
      return
    }
    setEmailError(undefined)
    setPending(true)
    // The answer is the same whether or not the account exists, so this page can't be used to find
    // out who has an account.
    await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setPending(false)
    const expiresAt = new Date(Date.now() + 30 * 60_000).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
    setSent({ to: email, expiresAt })
  }

  if (sent) {
    return (
      <AuthCard
        title="Check your inbox"
        subtitle={`If ${sent.to} has a Vento account, we sent it a reset link. It expires at ${sent.expiresAt}.`}
      >
        <p className="text-text-2">
          Not there? Check spam, or ask an owner to reset it from Settings › Members.
        </p>
        <Link to="/sign-in" className="text-pri-ink hover:underline">
          Back to sign in
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Reset your password" subtitle="We'll email a link that works for 30 minutes.">
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate>
        <Field
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          error={emailError}
        />
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? 'Sending…' : 'Send reset link'}
        </Button>
        <Link to="/sign-in" className="text-sm text-pri-ink hover:underline">
          Back to sign in
        </Link>
      </form>
    </AuthCard>
  )
}
