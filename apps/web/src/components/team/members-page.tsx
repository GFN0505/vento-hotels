// Members and roles (design #25, SetMembers; spec: stage-1-hotel-switch-scope): with one hotel
// chosen, the people who work there (whole-group people included, marked) and its invites; with All
// hotels, everyone. Pending invites sit above the people.
import type { MemberView } from '@vento/shared'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { useMe } from '@/lib/me'
import { EditMemberDialog } from './edit-member-dialog'
import { InviteDialog } from './invite-dialog'
import { Invited } from './invited'
import type { MembersSearch, OnMembersSearch } from './members-search'
import { NoAccess } from './no-access'
import { People, PeopleSkeleton } from './people'
import { useHotelPeople } from './use-hotel-people'

type Props = { search: MembersSearch; onSearch: OnMembersSearch }

export function MembersPage({ search, onSearch }: Props) {
  useScopedTitle('Members and roles')
  const me = useMe()
  const { scope, properties } = useProperty()
  const [inviting, setInviting] = useState(Boolean(search.invite))
  const [editing, setEditing] = useState<MemberView>()
  const canGrantWholeGroup = me.data?.member.allProperties ?? false
  // A group with one hotel reads as the group: "works only at" means nothing there.
  const oneHotelGroup = canGrantWholeGroup && properties.length === 1
  const hotel = scope?.kind === 'hotel' && !oneHotelGroup ? scope.hotel : undefined
  const people = useHotelPeople(hotel?.id, me.can('setup.manage'))

  if (me.isPending) return <PeopleSkeleton page />
  if (!me.can('setup.manage')) return <NoAccess what="members and roles" />

  const groupName = me.data?.organization.name ?? ''
  const myRole = me.data?.member.role
  const description = !hotel
    ? `Who can sign in to ${groupName}, their role, and which hotels they see.`
    : !canGrantWholeGroup
      ? `People you manage at ${hotel.name}.`
      : people.wholeGroup === undefined
        ? `People who work at ${hotel.name}.`
        : `People who work at ${hotel.name}, including ${people.wholeGroup} with access to the whole group.`
  // A new invite starts on the hotel being looked at; a new hotel's "Invite the team" link wins.
  const inviteHotel = search.invite ?? hotel?.id

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Members and roles"
        description={description}
        actions={
          <Button
            variant="primary"
            size="lg"
            className="max-lg:h-11"
            onClick={() => setInviting(true)}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            Invite people
          </Button>
        }
      />

      {canGrantWholeGroup && scope ? <Invited propertyId={hotel?.id} /> : null}
      <People
        search={search}
        onSearch={onSearch}
        hotel={hotel}
        onlyWholeGroup={canGrantWholeGroup && people.onlyWholeGroup}
        onEdit={setEditing}
        onInvite={() => setInviting(true)}
      />

      <InviteDialog
        key={inviteHotel ?? 'all'}
        open={inviting}
        onClose={() => {
          setInviting(false)
          if (search.invite) onSearch({ invite: undefined })
        }}
        myRole={myRole}
        canGrantWholeGroup={canGrantWholeGroup}
        hotelId={inviteHotel}
      />
      {editing ? (
        <EditMemberDialog
          key={editing.id}
          member={editing}
          groupName={groupName}
          hotel={hotel}
          myRole={myRole}
          canGrantWholeGroup={canGrantWholeGroup}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  )
}
