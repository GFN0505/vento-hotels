// Join from an invite (design #24, AuthInvite; decision 0020). New people set a name and password
// and are in, with no second email: the link already proved the inbox is theirs. People with an
// account sign in here instead.

import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type InvitationPreview, isStrongPassword, roleLabel } from '@vento/shared'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { AuthCard, AuthFootnote } from '@/components/auth-card'
import { PasswordRules } from '@/components/password-rules'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { api } from '@/lib/api'
import { authClient } from '@/lib/auth'
import { CANT_REACH_VENTO, isConnectionProblem, problemMessage } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import { checkNewPassword } from '@/lib/password'
import { longDate } from '@/lib/team'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/join/$token')({
  component: Join,
})

type Pending = Extract<InvitationPreview, { status: 'pending' }>

function Join() {
  const { token } = Route.useParams()
  const preview = useQuery({
    queryKey: ['invitation-preview', token],
    // A malformed link can't be an invite; treat it like any other link that doesn't work.
    queryFn: () =>
      /^[A-Za-z0-9_-]{43}$/.test(token)
        ? api.invitations.preview({ token })
        : Promise.resolve<InvitationPreview>({ status: 'unavailable', invitedBy: null }),
    retry: 1,
  })
  const session = authClient.useSession()

  if (preview.isPending || session.isPending) {
    return (
      <AuthCard title="Opening your invite…" subtitle="One moment.">
        <span aria-hidden="true" className="h-12 animate-pulse rounded-sm bg-surface-2" />
      </AuthCard>
    )
  }
  if (preview.isError) {
    return (
      <AuthCard title="Can't open your invite" subtitle={CANT_REACH_VENTO}>
        <Button variant="primary" size="lg" onClick={() => preview.refetch()}>
          Try again
        </Button>
      </AuthCard>
    )
  }
  if (preview.data.status === 'unavailable')
    return <Unavailable invitedBy={preview.data.invitedBy} />

  const invite = preview.data
  const signedInAs = session.data?.user.email
  if (signedInAs && signedInAs.toLowerCase() !== invite.email.toLowerCase()) {
    return <WrongAccount invite={invite} signedInAs={signedInAs} />
  }
  if (signedInAs) return <AcceptSignedIn invite={invite} token={token} />
  return invite.hasAccount ? (
    <SignInToAccept invite={invite} token={token} />
  ) : (
    <CreateAccount invite={invite} token={token} />
  )
}

function inviteSummary(invite: Pending): string {
  const where = invite.allProperties
    ? `across ${invite.organizationName}`
    : `at ${invite.propertyNames.join(', ')}`
  return `${invite.invitedBy} invited you as ${roleLabel(invite.role)} ${where}. This invite works until ${longDate(invite.expiresAt)}.`
}

// After joining or accepting: make the group active and go home.
async function enterGroup(
  navigate: ReturnType<typeof useNavigate>,
  groupName: string,
  organizationId?: string,
) {
  if (organizationId) await authClient.organization.setActive({ organizationId })
  await navigate({ to: '/' })
  toast.success(`Welcome to ${groupName}`)
}

function Unavailable({ invitedBy }: { invitedBy: string | null }) {
  usePageTitle('Invite unavailable')
  return (
    <AuthCard
      title="This invite can't be used"
      subtitle={`It may have expired, been used already, or been cancelled. Ask ${invitedBy ?? 'whoever invited you'} for a new one.`}
    >
      <Link
        to="/sign-in"
        className="inline-flex min-h-11 items-center text-pri-ink hover:underline"
      >
        Go to sign in
      </Link>
    </AuthCard>
  )
}

function WrongAccount({ invite, signedInAs }: { invite: Pending; signedInAs: string }) {
  usePageTitle(`Join ${invite.organizationName}`)
  const [pending, setPending] = useState(false)
  return (
    <AuthCard title={`Join ${invite.organizationName}`} subtitle={inviteSummary(invite)}>
      <p className="rounded-sm bg-am-bg px-3 py-2 text-am">
        This invite is for <span className="font-medium break-all">{invite.email}</span>, but you're
        signed in as <span className="font-medium break-all">{signedInAs}</span>.
      </p>
      <Button
        variant="primary"
        size="lg"
        loading={pending}
        onClick={async () => {
          setPending(true)
          // Signing out updates the session here, and the page offers the right way in.
          await authClient.signOut()
        }}
      >
        Sign out and continue
      </Button>
    </AuthCard>
  )
}

function AcceptSignedIn({ invite, token }: { invite: Pending; token: string }) {
  usePageTitle(`Join ${invite.organizationName}`)
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  async function accept() {
    setPending(true)
    setError(undefined)
    try {
      const { organizationId } = await api.invitations.accept({ token })
      await enterGroup(navigate, invite.organizationName, organizationId)
    } catch (failure) {
      setError(problemMessage(failure))
      setPending(false)
    }
  }
  return (
    <AuthCard title={`Join ${invite.organizationName}`} subtitle={inviteSummary(invite)}>
      <div className="flex flex-col gap-[18px]">
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        <Button variant="primary" size="lg" loading={pending} onClick={accept}>
          {pending ? 'Joining…' : 'Accept and continue'}
        </Button>
      </div>
    </AuthCard>
  )
}

function SignInToAccept({ invite, token }: { invite: Pending; token: string }) {
  usePageTitle(`Join ${invite.organizationName}`)
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [passwordError, setPasswordError] = useState<string>()

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const password = String(new FormData(formElement).get('password') ?? '')
    if (!password) {
      setPasswordError('Enter your password')
      focusFirstProblem(formElement, ['password'], { password: 'Enter your password' })
      return
    }
    setPasswordError(undefined)
    setError(undefined)
    setPending(true)
    const { data: signedIn, error: failure } = await authClient.signIn.email({
      email: invite.email,
      password,
    })
    // Two-step sign-in is on: finish signing in on the sign-in page, which brings them back here.
    if (signedIn && 'twoFactorRedirect' in signedIn && signedIn.twoFactorRedirect) {
      window.location.assign(`/sign-in?redirect=${encodeURIComponent(window.location.pathname)}`)
      return
    }
    if (failure) {
      setPending(false)
      setError(
        isConnectionProblem(failure)
          ? CANT_REACH_VENTO
          : failure.status === 429
            ? 'Too many sign-in attempts. Wait 10 minutes, then try again.'
            : 'Wrong password. Try again, or reset it.',
      )
      return
    }
    try {
      const { organizationId } = await api.invitations.accept({ token })
      await enterGroup(navigate, invite.organizationName, organizationId)
    } catch (acceptFailure) {
      setError(problemMessage(acceptFailure))
      setPending(false)
    }
  }

  return (
    <AuthCard title={`Join ${invite.organizationName}`} subtitle={inviteSummary(invite)}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        <p className="text-text-2">
          You already have a Vento account as{' '}
          <span className="font-medium text-text">{invite.email}</span>. Sign in to accept.
        </p>
        <input type="hidden" name="username" autoComplete="username" value={invite.email} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          revealable
          autoFocus
          error={passwordError}
        />
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {pending ? 'Joining…' : 'Sign in and accept'}
        </Button>
        <AuthFootnote>
          <Link to="/forgot-password">Forgot password?</Link>
        </AuthFootnote>
      </form>
    </AuthCard>
  )
}

type Errors = {
  name?: string | undefined
  password?: string | undefined
  confirm?: string | undefined
}

function nameProblem(value: string): string | undefined {
  return value.trim().length < 2 ? 'Enter your full name' : undefined
}

function CreateAccount({ invite, token }: { invite: Pending; token: string }) {
  usePageTitle(`Join ${invite.organizationName}`)
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const name = String(new FormData(formElement).get('name') ?? '').trim()
    const found: Errors = { ...checkNewPassword(newPassword, confirm) }
    const badName = nameProblem(name)
    if (badName) found.name = badName
    setErrors(found)
    setError(undefined)
    if (Object.values(found).some(Boolean)) {
      focusFirstProblem(formElement, ['name', 'password', 'confirm'], found)
      return
    }
    setPending(true)
    try {
      await api.invitations.join({ token, name, password: newPassword })
      const { error: signInFailure } = await authClient.signIn.email({
        email: invite.email,
        password: newPassword,
      })
      if (signInFailure) throw signInFailure
      const { data: organizations } = await authClient.organization.list()
      await enterGroup(navigate, invite.organizationName, organizations?.[0]?.id)
    } catch (failure) {
      setError(problemMessage(failure))
      setPending(false)
    }
  }

  const passwordsMatch =
    confirm.length > 0 && confirm === newPassword && isStrongPassword(newPassword)
  return (
    <AuthCard title={`Join ${invite.organizationName}`} subtitle={inviteSummary(invite)}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-2">Email</span>
          <span className="font-medium break-all">{invite.email}</span>
        </div>
        <input type="hidden" name="username" autoComplete="username" value={invite.email} />
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          autoCapitalize="words"
          maxLength={80}
          autoFocus
          validate={nameProblem}
          error={errors.name}
        />
        <Field
          label="Create a password"
          name="password"
          type="password"
          autoComplete="new-password"
          revealable
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-describedby={newPassword || errors.password ? 'password-rules' : undefined}
          error={errors.password}
        />
        {newPassword || errors.password ? (
          <PasswordRules id="password-rules" password={newPassword} />
        ) : null}
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          revealable
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          validate={(value) =>
            value.length > 0 && value !== newPassword
              ? "Passwords don't match. Type it again."
              : undefined
          }
          success={passwordsMatch ? 'Passwords match' : undefined}
          error={errors.confirm}
        />
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {pending ? 'Joining…' : 'Accept and continue'}
        </Button>
      </form>
    </AuthCard>
  )
}
