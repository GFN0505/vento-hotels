// The setup steps for a new group (design: OnbHome), from Home's summary and the member's own
// state. Shared by the checklist and Home's "Setup" tile so they always agree.
import { useQuery } from '@tanstack/react-query'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'

export type SetupStepKey = 'group' | 'hotel' | 'rooms' | 'team' | 'pin' | 'devices' | 'two-step'

export type SetupStep = { key: SetupStepKey; label: string; why: string; done: boolean }

export function useSetupSteps(): { steps: SetupStep[]; done: number; ready: boolean } {
  const me = useMe()
  const summary = useQuery(orpc.organization.home.queryOptions())
  const s = summary.data
  if (!s || !me.data) return { steps: [], done: 0, ready: false }
  const steps: SetupStep[] = [
    {
      key: 'group',
      label: 'Create your hotel group',
      why: 'Your group, company and settings',
      done: true,
    },
    {
      key: 'hotel',
      label: 'Add your first hotel',
      why: 'Where rooms, staff and money live',
      done: s.hotels > 0,
    },
    {
      key: 'rooms',
      label: 'Set up rooms',
      why: 'Room types and rooms, so you can sell them',
      done: s.rooms > 0,
    },
    {
      key: 'team',
      label: 'Invite your team',
      why: 'Managers and staff, each with their own sign-in',
      done: (s.members ?? 0) > 1 || (s.pendingInvites ?? 0) > 0,
    },
    {
      key: 'pin',
      label: 'Set your staff PIN',
      why: 'Four digits to sign in on shared devices',
      done: me.data.hasPin,
    },
    {
      key: 'devices',
      label: 'Register shared devices',
      why: 'Restaurant tablets, front desk PCs, housekeeping phones',
      done: (s.devices ?? 0) > 0,
    },
    {
      key: 'two-step',
      label: 'Turn on two-step sign-in',
      why: 'A code from your phone keeps your account safe',
      done: me.data.twoStep,
    },
  ]
  return { steps, done: steps.filter((step) => step.done).length, ready: true }
}
