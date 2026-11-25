// Where the reset link lands: choose a new password, then sign in with it.
import { createFileRoute, Link } from '@tanstack/react-router'
import { isStrongPassword } from '@vento/shared'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { AuthCard } from '@/components/auth-card'
import { PasswordRules } from '@/components/password-rules'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { authClient } from '@/lib/auth'
import { CANT_REACH_VENTO, isConnectionProblem } from '@/lib/errors'
import { checkNewPassword, type PasswordErrors } from '@/lib/password'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({ token: z.string().optional(), error: z.string().optional() }),
  component: ResetPassword,
})

function ResetPassword() {
  const { token, error: linkError } = Route.useSearch()
  const [done, setDone] = useState(false)
  const [errors, setErrors] = useState<PasswordErrors>({})
  const [failure, setFailure] = useState<string>()
  const [pending, setPending] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  usePageTitle(
    !token || linkError ? 'Link expired' : done ? 'Password changed' : 'Choose a new password',
  )

  if (!token || linkError) {
    return (
      <AuthCard title="This link has expired" subtitle="Reset links work once, for 30 minutes.">
        <Link to="/forgot-password" className="text-pri-ink hover:underline">
          Send a new link
        </Link>
        <Link to="/sign-in" className="text-sm text-pri-ink hover:underline">
          Back to sign in
        </Link>
      </AuthCard>
    )
  }

  if (done) {
    return (
      <AuthCard title="Password changed" subtitle="You've been signed out everywhere else.">
        <Link to="/sign-in" className="text-pri-ink hover:underline">
          Sign in with your new password
        </Link>
      </AuthCard>
    )
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    const found = checkNewPassword(password, String(form.get('confirm')))
    setErrors(found)
    setFailure(undefined)
    if (Object.keys(found).length > 0 || !token) return
    setPending(true)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    setPending(false)
    if (error) {
      setFailure(
        isConnectionProblem(error)
          ? CANT_REACH_VENTO
          : error.code === 'INVALID_TOKEN'
            ? 'This link has expired. Send a new one from the sign-in page.'
            : error.code === 'PASSWORD_TOO_WEAK'
              ? "Your password doesn't meet every rule yet."
              : "We couldn't change your password. Try again.",
      )
      return
    }
    setDone(true)
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate>
        {failure ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {failure}
          </p>
        ) : null}
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          revealable
          autoFocus
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-describedby={newPassword || errors.password ? 'password-rules' : undefined}
          error={errors.password}
        />
        {/* The checklist appears once they start typing, not before. */}
        {newPassword || errors.password ? (
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
          success={
            confirm.length > 0 && confirm === newPassword && isStrongPassword(newPassword)
              ? 'Passwords match'
              : undefined
          }
          error={errors.confirm}
        />
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {pending ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </AuthCard>
  )
}
