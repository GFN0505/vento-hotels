// Invited (design #25, SetMembers): invites not accepted yet, with Resend and Cancel. Follows the
// hotel switch like the people below it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type InvitationView, ROLE_INFO } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { keepWithinHotel } from '@/lib/scope'
import { hotelsSummary, shortDate } from '@/lib/team'

const INVITES_SHOWN = 3

// With one hotel chosen: invites that include it, plus whole-group invites. Hidden when none.
export function Invited({ propertyId }: { propertyId: string | undefined }) {
  const [showAll, setShowAll] = useState(false)
  const invites = useQuery({
    ...orpc.invitations.list.queryOptions({ input: { propertyId, pageSize: 50 } }),
    placeholderData: keepWithinHotel(propertyId),
  })
  if (!invites.data || invites.data.items.length === 0) return null
  const { items, total } = invites.data
  // A long list of invites shouldn't push People off the screen: first few, then "Show all".
  const shown = showAll ? items : items.slice(0, INVITES_SHOWN)
  return (
    <section aria-labelledby="invited-heading" className="flex flex-col gap-2">
      <h2 id="invited-heading" className="font-semibold">
        Invited <span className="font-normal text-text-3">{total}</span>
      </h2>
      <Card>
        <ul className="divide-y divide-border">
          {shown.map((invite) => (
            <InviteRow key={invite.id} invite={invite} />
          ))}
        </ul>
        {items.length > INVITES_SHOWN ? (
          <div className="border-t border-border px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="max-lg:h-11"
              aria-expanded={showAll}
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Show fewer' : `Show all ${items.length}`}
            </Button>
          </div>
        ) : null}
      </Card>
    </section>
  )
}

function InviteRow({ invite }: { invite: InvitationView }) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.invitations.key() })
  const resend = useMutation({
    mutationFn: () => api.invitations.resend({ id: invite.id }),
    onSuccess: async () => {
      await refresh()
      toast.success(`New invite sent to ${invite.email}`)
    },
    onError: (error) => toast.error(problemMessage(error)),
  })
  const cancel = useMutation({
    mutationFn: () => api.invitations.cancel({ id: invite.id }),
    onSuccess: async () => {
      await refresh()
      toast.success(`Invite to ${invite.email} cancelled`)
    },
    onError: (error) => toast.error(problemMessage(error)),
  })
  const expired = invite.status === 'expired'

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex min-w-0 grow basis-64 flex-col">
        <span className="truncate font-medium" title={invite.email}>
          {invite.email}
        </span>
        <span className="text-sm text-text-2">
          {ROLE_INFO[invite.role].label} · {hotelsSummary(invite.allProperties, invite.properties)}
        </span>
      </div>
      <span className={cn('text-sm whitespace-nowrap', expired ? 'text-am' : 'text-text-3')}>
        {expired
          ? `Expired ${shortDate(invite.expiresAt)}`
          : `Sent ${shortDate(invite.sentAt)} by ${invite.invitedBy} · until ${shortDate(invite.expiresAt)}`}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="max-lg:h-11"
          loading={resend.isPending}
          disabled={cancel.isPending}
          onClick={() => resend.mutate()}
          aria-label={`Resend invite to ${invite.email}`}
        >
          Resend
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="max-lg:h-11"
          loading={cancel.isPending}
          disabled={resend.isPending}
          onClick={() => cancel.mutate()}
          aria-label={`Cancel invite to ${invite.email}`}
        >
          Cancel
        </Button>
      </div>
    </li>
  )
}
