// Design: 24 · Forgot password and · Reset link sent.
import { createFileRoute, Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { EmailField } from '@/components/ui/email-field'
import { authClient } from '@/lib/auth'
import { emailProblem } from '@/lib/email'
import { CANT_REACH_VENTO, isConnectionProblem } from '@/lib/errors'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPassword,
})

function ForgotPassword() {
  const [sent, setSent] = useState<{ to: string; expiresAt: string }>()
  const [emailError, setEmailError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string>()
  usePageTitle('Reset your password')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email')).trim()
    const problem = emailProblem(email)
    if (problem) {
      setEmailError(problem)
      return
    }
    setEmailError(undefined)
    setFailure(undefined)
    setPending(true)
    // The answer is the same whether or not the account exists, so this page can't be used to find
    // out who has an account.
    const { error: failure } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setPending(false)
    if (isConnectionProblem(failure)) {
      setFailure(CANT_REACH_VENTO)
      return
    }
    if (failure?.status === 429) {
      setFailure('Too many reset requests from this network. Wait 10 minutes, then try again.')
      return
    }
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
        {failure ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {failure}
          </p>
        ) : null}
        <EmailField autoComplete="username" autoFocus error={emailError} />
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {pending ? 'Sending…' : 'Send reset link'}
        </Button>
        <Link to="/sign-in" className="text-sm text-pri-ink hover:underline">
          Back to sign in
        </Link>
      </form>
    </AuthCard>
  )
}
