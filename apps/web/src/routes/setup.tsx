// Onboarding step 2 (design 19): create the hotel group, its company and the first hotel.
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { api } from '@/lib/api'
import { authClient } from '@/lib/auth'
import { loadSignedIn } from '@/lib/session'

export const Route = createFileRoute('/setup')({
  beforeLoad: async () => {
    const signedIn = await loadSignedIn()
    if (!signedIn) throw redirect({ to: '/sign-in' })
    if (signedIn.organizationId) throw redirect({ to: '/' })
  },
  component: Setup,
})

function slugFor(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${base || 'group'}-${crypto.randomUUID().slice(0, 6)}`
}

function Setup() {
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const groupName = String(form.get('group'))
    setPending(true)
    setError(undefined)
    try {
      const { error: failure } = await authClient.organization.create({
        name: groupName,
        slug: slugFor(groupName),
      })
      if (failure) throw new Error(failure.message)
      const entity = await api.entities.create({ name: String(form.get('company')) })
      await api.properties.create({
        entityId: entity.id,
        name: String(form.get('hotel')),
        state: String(form.get('state')) || undefined,
      })
      await navigate({ to: '/' })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
      setPending(false)
    }
  }

  return (
    <AuthCard title="Your hotel group" subtitle="You can add more hotels and companies later.">
      <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        {error ? (
          <p role="alert" className="rounded-sm bg-ro-bg px-3 py-2 text-ro">
            {error}
          </p>
        ) : null}
        <Field
          label="Group name"
          name="group"
          placeholder="Kora Hotels Group"
          required
          minLength={2}
        />
        <Field
          label="Company (as registered with CAC)"
          name="company"
          placeholder="Kora Hospitality Ltd"
          required
          minLength={2}
        />
        <Field
          label="First hotel"
          name="hotel"
          placeholder="Kora Victoria Island"
          required
          minLength={2}
        />
        <Field label="State" name="state" placeholder="Lagos" />
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? 'Setting up…' : 'Continue'}
        </Button>
      </form>
    </AuthCard>
  )
}
