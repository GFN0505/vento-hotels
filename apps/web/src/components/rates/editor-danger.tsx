// Archive, restore or delete a plan, at the foot of the editor, kept apart from saving. A plan that
// others follow can't be archived until they're archived or point elsewhere.
import { useNavigate } from '@tanstack/react-router'
import type { RatePlanView } from '@vento/shared'
import { Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { listNames } from './format'
import { usePlanActions } from './use-plan-actions'

export function EditorDanger({ plan, canWrite }: { plan: RatePlanView; canWrite: boolean }) {
  const navigate = useNavigate()
  const actions = usePlanActions({
    onDeleted: () => void navigate({ to: '/rates/plans', search: { show: 'archived' } }),
  })
  const followers = plan.followers.map((f) => f.name)
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <Archive className="size-4 text-text-3" aria-hidden="true" />
        {plan.archivedAt ? 'Archived plan' : 'Archive'}
      </h2>
      {plan.archivedAt ? (
        <>
          <p className="text-sm text-text-2">
            Not offered for new bookings. Bookings already made keep their price and terms.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="max-lg:h-11"
              disabled={!canWrite}
              loading={actions.restoring === plan.id}
              onClick={() => actions.restore(plan)}
            >
              Restore
            </Button>
            {plan.canDelete ? (
              <Button
                variant="danger"
                className="max-lg:h-11"
                disabled={!canWrite}
                onClick={() => actions.remove(plan)}
              >
                Delete for good
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-text-2">
            {followers.length > 0
              ? `${listNames(followers)} ${followers.length === 1 ? 'follows' : 'follow'} ${plan.name}. Archive ${followers.length === 1 ? 'it' : 'them'} first, or point ${followers.length === 1 ? 'it' : 'them'} to another plan.`
              : 'Stops new bookings on this plan. You can restore it later.'}
          </p>
          <Button
            variant="danger"
            className="self-start max-lg:h-11"
            disabled={!canWrite || followers.length > 0}
            onClick={() => actions.archive(plan)}
          >
            Archive plan
          </Button>
        </>
      )}
      {actions.dialog}
    </Card>
  )
}
