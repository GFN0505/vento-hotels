// Onboarding step 2 (design 19): create the hotel group, its company and the first hotel.

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { NIGERIAN_STATES } from '@vento/shared'
import { type FormEvent, useRef, useState } from 'react'
import { AuthCard, AuthFootnote } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { SelectField } from '@/components/ui/select-field'
import { api } from '@/lib/api'
import { authClient } from '@/lib/auth'
import { CANT_REACH_VENTO } from '@/lib/errors'
import { focusFirstProblem } from '@/lib/forms'
import { loadSignedIn } from '@/lib/session'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    const signedIn = await loadSignedIn()
    if (!signedIn) throw redirect({ to: '/sign-in' })
    if (signedIn.organizationId) throw redirect({ to: '/' })
  },
  component: Setup,
})

const FIELDS = ['group', 'company', 'hotel'] as const
type FieldName = (typeof FIELDS)[number]
type Problems = Partial<Record<FieldName, string>>

// Same limits as the API (packages/shared contracts/tenancy.ts), checked here so people see them
// before sending.
function nameProblem(value: string): string | undefined {
  const length = value.trim().length
  if (length === 0) return 'Enter a name'
  if (length < 2) return 'Enter at least 2 characters'
  return undefined
}

function slugFor(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${base || 'group'}-${crypto.randomUUID().slice(0, 6)}`
}

function Setup() {
  usePageTitle('Your hotel group')
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const [problems, setProblems] = useState<Problems>({})
  const [failure, setFailure] = useState<string>()
  const [pending, setPending] = useState(false)
  // If a later step fails, a retry carries on from there instead of creating a second group.
  const done = useRef<{ group?: boolean; entityId?: string }>({})

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const values = Object.fromEntries(FIELDS.map((name) => [name, String(form.get(name) ?? '')]))
    const found: Problems = {}
    for (const name of FIELDS) {
      const problem = nameProblem(values[name] ?? '')
      if (problem) found[name] = problem
    }
    setProblems(found)
    setFailure(undefined)
    if (FIELDS.some((name) => found[name])) {
      focusFirstProblem(formElement, FIELDS, found)
      return
    }

    setPending(true)
    try {
      if (!done.current.group) {
        const group = values.group?.trim() ?? ''
        const { error } = await authClient.organization.create({
          name: group,
          slug: slugFor(group),
        })
        if (error) throw error
        done.current.group = true
      }
      if (!done.current.entityId) {
        const entity = await api.entities.create({ name: values.company?.trim() ?? '' })
        done.current.entityId = entity.id
      }
      await api.properties.create({
        entityId: done.current.entityId,
        name: values.hotel?.trim() ?? '',
        state: String(form.get('state') ?? '') || undefined,
      })
      await navigate({ to: '/' })
    } catch {
      setFailure(CANT_REACH_VENTO)
      setPending(false)
    }
  }

  async function signOut() {
    await authClient.signOut()
    await navigate({ to: '/sign-in' })
  }

  return (
    <AuthCard title="Your hotel group" subtitle="You can add more hotels and companies later.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
        {failure ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {failure}
          </p>
        ) : null}
        <Field
          label="Group name"
          name="group"
          placeholder="e.g. Kora Hotels Group"
          autoCapitalize="words"
          maxLength={120}
          validate={nameProblem}
          error={problems.group}
        />
        <Field
          label="Company"
          name="company"
          placeholder="e.g. Kora Hospitality Ltd"
          hint="Name on your CAC certificate"
          autoCapitalize="words"
          maxLength={120}
          validate={nameProblem}
          error={problems.company}
        />
        <Field
          label="First hotel"
          name="hotel"
          placeholder="e.g. Kora Victoria Island"
          autoCapitalize="words"
          maxLength={120}
          validate={nameProblem}
          error={problems.hotel}
        />
        <SelectField
          label="State"
          name="state"
          options={NIGERIAN_STATES}
          placeholder="Choose a state"
          defaultValue=""
        />
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {pending ? 'Setting up…' : 'Continue'}
        </Button>
        {session ? (
          <AuthFootnote>
            Signed in as {session.user.email}.{' '}
            <button type="button" onClick={signOut}>
              Not you?
            </button>
          </AuthFootnote>
        ) : null}
      </form>
    </AuthCard>
  )
}
