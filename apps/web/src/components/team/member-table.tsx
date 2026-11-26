// The people list (design #25, SetMembers): name and email, role, which hotels they see, when they
// joined. A table on wide screens; on phones each person is a two-line row.
import { type MemberView, ROLE_INFO } from '@vento/shared'
import { Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { hotelsSummary, initials, longDate } from '@/lib/team'

export function MemberTable({
  members,
  onEdit,
  hotelId,
}: {
  members: MemberView[]
  onEdit: (m: MemberView) => void
  // One hotel in view: "Can see" says only what differs from it (Whole group, other hotels).
  hotelId: string | undefined
}) {
  return (
    <Card>
      <table className="w-full table-fixed border-collapse text-left max-xl:block">
        <thead className="max-xl:sr-only">
          <tr className="border-b border-border text-sm text-text-3">
            <th scope="col" className="px-4 py-2.5 font-medium">
              Name
            </th>
            <th scope="col" className="w-40 px-4 py-2.5 font-medium">
              Role
            </th>
            <th scope="col" className="w-48 px-4 py-2.5 font-medium">
              Can see
            </th>
            <th scope="col" className="w-28 px-4 py-2.5 font-medium max-2xl:hidden">
              Joined
            </th>
            <th scope="col" className="w-20 px-4 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border max-xl:block">
          {members.map((member) => (
            <tr
              key={member.id}
              className="max-xl:grid max-xl:grid-cols-[minmax(0,1fr)_auto] max-xl:gap-x-3 max-xl:px-4 max-xl:py-3"
            >
              <td className="px-4 py-3 max-xl:col-start-1 max-xl:p-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-grid size-8 flex-none place-items-center rounded-full bg-pri-soft text-xs font-semibold text-pri-ink"
                  >
                    {initials(member.name)}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium xl:truncate" title={member.name}>
                      {member.name}
                      {member.isYou ? (
                        <span className="font-normal text-text-3"> (you)</span>
                      ) : null}
                      {member.twoStep ? (
                        <span className="ml-2 rounded-full bg-em-bg px-1.5 py-0.5 text-xs font-medium text-em">
                          Two-step
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-sm text-text-2" title={member.email}>
                      {member.email}
                    </span>
                  </div>
                </div>
              </td>
              <td className="truncate px-4 py-3 max-xl:col-start-1 max-xl:p-0 max-xl:pl-11 max-xl:text-sm max-xl:text-text-2">
                {ROLE_INFO[member.role].label}
                {hotelId ? (
                  <CanSeeHere member={member} hotelId={hotelId} phone />
                ) : (
                  <span className="xl:hidden">
                    {' '}
                    · {hotelsSummary(member.allProperties, member.properties)}
                  </span>
                )}
              </td>
              <td
                className="truncate px-4 py-3 max-xl:hidden"
                title={member.properties.map((p) => p.name).join(', ') || undefined}
              >
                {hotelId ? (
                  <CanSeeHere member={member} hotelId={hotelId} />
                ) : (
                  hotelsSummary(member.allProperties, member.properties)
                )}
              </td>
              <td className="num px-4 py-3 whitespace-nowrap text-text-2 max-2xl:hidden">
                {longDate(member.joinedAt)}
              </td>
              <td className="px-4 py-3 text-right max-xl:col-start-2 max-xl:row-span-2 max-xl:row-start-1 max-xl:self-center max-xl:p-0">
                {member.isYou ? null : (
                  <Button
                    size="sm"
                    className="max-lg:h-11"
                    onClick={() => onEdit(member)}
                    aria-label={`Edit ${member.name}`}
                  >
                    Edit
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// Same globe as the "Whole group" line on group-wide pages.
function WholeGroup() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sl-bg px-2 py-0.5 text-xs font-medium whitespace-nowrap text-sl">
      <Globe className="size-3" aria-hidden="true" />
      Whole group
    </span>
  )
}

// With one hotel in view everyone listed works there, so "Can see" says only what's beyond it:
// Whole group, or the other hotels; "Only here" (wide screens) for people at this hotel alone.
function CanSeeHere({
  member,
  hotelId,
  phone = false,
}: {
  member: MemberView
  hotelId: string
  phone?: boolean
}) {
  const others = member.properties.filter((p) => p.id !== hotelId)
  const content = member.allProperties ? (
    <WholeGroup />
  ) : others.length === 1 ? (
    `Also at ${others[0]?.name}`
  ) : others.length > 1 ? (
    `Also at ${others.length} other hotels`
  ) : phone ? null : (
    <span className="text-text-3">Only here</span>
  )
  if (!content) return null
  return phone ? <span className="mt-1 block truncate xl:hidden">{content}</span> : content
}
