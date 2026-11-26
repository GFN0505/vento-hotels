// Members and roles (design #25, SetMembers): who's in the group, what role, which hotels; pending
// invites above. Search, filter and page live in the URL so a view can be shared or refreshed.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type InvitationView, type MemberView, ROLE_INFO, type RoleFilter } from '@vento/shared'
import { Search, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EditMemberDialog } from '@/components/team/edit-member-dialog'
import { InviteDialog } from '@/components/team/invite-dialog'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { useMe } from '@/lib/me'
import { hotelsSummary, initials, longDate, shortDate } from '@/lib/team'
import { usePageTitle } from '@/lib/title'

const PAGE_SIZE = 25

type MembersSearch = {
  q?: string | undefined
  filter?: RoleFilter | undefined
  page?: number | undefined
  // Opens the invite limited to this hotel (a new hotel's "Invite the team").
  invite?: string | undefined
}

// Reads ?q=&filter=&page= and drops anything malformed. Hand-written rather than zod: route options
// load with the first page, and zod would add ~14 KB to it (apps/web/bundle-budget.json).
function readSearch(search: Record<string, unknown>): MembersSearch {
  const result: MembersSearch = {}
  if (typeof search.q === 'string' && search.q.trim()) result.q = search.q.trim().slice(0, 120)
  if (search.filter === 'admins' || search.filter === 'managers' || search.filter === 'staff') {
    result.filter = search.filter
  }
  const page = Number(search.page)
  if (Number.isInteger(page) && page > 1) result.page = page
  if (typeof search.invite === 'string' && search.invite) result.invite = search.invite.slice(0, 40)
  return result
}

export const Route = createFileRoute('/_app/settings/members')({
  validateSearch: readSearch,
  component: MembersPage,
})

const FILTERS: { value: RoleFilter | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'admins', label: 'Owners and admins' },
  { value: 'managers', label: 'Managers' },
  { value: 'staff', label: 'Staff' },
]

function MembersPage() {
  usePageTitle('Members and roles')
  const me = useMe()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [inviting, setInviting] = useState(Boolean(search.invite))
  const [editing, setEditing] = useState<MemberView>()

  if (me.isPending) return <PageSkeleton />
  if (!me.can('setup.manage')) return <NoAccess what="members and roles" />

  const groupName = me.data?.organization.name ?? ''
  const myRole = me.data?.member.role
  const canGrantWholeGroup = me.data?.member.allProperties ?? false

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-2xl">
            Members and roles
          </h1>
          <p className="text-text-2">
            Who can sign in to {groupName}, their role, and which hotels they see.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          className="max-lg:h-11"
          onClick={() => setInviting(true)}
        >
          <UserPlus className="size-4" aria-hidden="true" />
          Invite people
        </Button>
      </header>

      {canGrantWholeGroup ? <Invited /> : null}
      <People onEdit={setEditing} onInvite={() => setInviting(true)} />

      <InviteDialog
        open={inviting}
        onClose={() => {
          setInviting(false)
          if (search.invite) void navigate({ search: (prev) => ({ ...prev, invite: undefined }) })
        }}
        myRole={myRole}
        canGrantWholeGroup={canGrantWholeGroup}
        hotelId={search.invite}
      />
      {editing ? (
        <EditMemberDialog
          key={editing.id}
          member={editing}
          groupName={groupName}
          myRole={myRole}
          canGrantWholeGroup={canGrantWholeGroup}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  )
}

const INVITES_SHOWN = 3

function Invited() {
  const [showAll, setShowAll] = useState(false)
  const invites = useQuery(orpc.invitations.list.queryOptions({ input: { pageSize: 50 } }))
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

function People({ onEdit, onInvite }: { onEdit: (m: MemberView) => void; onInvite: () => void }) {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [text, setText] = useState(search.q ?? '')
  const page = search.page ?? 1

  // Searching waits for a pause in typing, so the list doesn't flicker on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = text.trim() || undefined
      if (q !== search.q) void navigate({ search: (prev) => ({ ...prev, q, page: undefined }) })
    }, 250)
    return () => clearTimeout(timer)
  }, [text, search.q, navigate])

  const members = useQuery({
    ...orpc.members.list.queryOptions({
      input: { search: search.q, filter: search.filter, page, pageSize: PAGE_SIZE },
    }),
    placeholderData: keepPreviousData,
  })
  const filtered = Boolean(search.q || search.filter)

  return (
    <section aria-labelledby="people-heading" className="flex flex-col gap-3">
      <h2 id="people-heading" className="font-semibold">
        People{' '}
        {members.data ? (
          <span className="font-normal text-text-3">{members.data.total}</span>
        ) : null}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-0 grow basis-56 items-center sm:max-w-xs">
          <span className="sr-only">Search name or email</span>
          <Search
            className="pointer-events-none absolute left-2.5 size-4 text-text-3"
            aria-hidden="true"
          />
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search name or email"
            className="h-11 w-full rounded-sm border border-input bg-surface pr-2.5 pl-8 text-[16px] text-text placeholder:text-text-3 focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none lg:h-8 lg:text-base"
          />
        </label>
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Filter by role</legend>
          {FILTERS.map((option) => {
            const active = search.filter === option.value
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  navigate({
                    search: (prev) => ({ ...prev, filter: option.value, page: undefined }),
                  })
                }
                className={cn(
                  'h-11 rounded-full border px-3 text-sm font-medium lg:h-7',
                  active
                    ? 'border-pri bg-pri-soft text-pri-ink'
                    : 'border-border-strong bg-surface text-text-2 hover:bg-surface-2',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </fieldset>
      </div>

      {members.isPending ? (
        <ListSkeleton />
      ) : members.isError ? (
        <Card className="flex flex-col items-start gap-3 p-5" role="alert">
          <p className="font-medium">We couldn't load the people in your group.</p>
          <p className="text-text-2">{problemMessage(members.error)}</p>
          <Button onClick={() => members.refetch()}>Try again</Button>
        </Card>
      ) : members.data.items.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 p-5">
          <p className="font-medium">
            {filtered ? 'No one matches these filters.' : 'Nobody here yet'}
          </p>
          {filtered ? (
            <Button
              onClick={() => {
                setText('')
                void navigate({ search: {} })
              }}
            >
              Clear filters
            </Button>
          ) : (
            <Button variant="primary" className="max-lg:h-11" onClick={onInvite}>
              Invite people
            </Button>
          )}
        </Card>
      ) : (
        <>
          <MemberTable members={members.data.items} onEdit={onEdit} />
          {members.data.total === 1 && !filtered ? (
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <p className="grow text-text-2">
                It's just you so far. Invite your managers and front desk to get started.
              </p>
            </Card>
          ) : null}
          <Pagination
            page={page}
            total={members.data.total}
            onPage={(next) => navigate({ search: (prev) => ({ ...prev, page: next }) })}
          />
        </>
      )}
    </section>
  )
}

function MemberTable({
  members,
  onEdit,
}: {
  members: MemberView[]
  onEdit: (m: MemberView) => void
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
                <span className="xl:hidden">
                  {' '}
                  · {hotelsSummary(member.allProperties, member.properties)}
                </span>
              </td>
              <td
                className="truncate px-4 py-3 max-xl:hidden"
                title={member.properties.map((p) => p.name).join(', ') || undefined}
              >
                {hotelsSummary(member.allProperties, member.properties)}
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

function Pagination({
  page,
  total,
  onPage,
}: {
  page: number
  total: number
  onPage: (p: number) => void
}) {
  if (total <= PAGE_SIZE) return null
  const first = (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, total)
  return (
    <nav aria-label="Pages" className="flex items-center justify-end gap-3">
      <span className="num text-sm text-text-2">
        {first}–{last} of {total}
      </span>
      <Button
        size="sm"
        className="max-lg:h-11"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <Button
        size="sm"
        className="max-lg:h-11"
        disabled={last >= total}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  )
}

function ListSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading people">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
        >
          <span className="size-8 animate-pulse rounded-full bg-surface-2" />
          <span className="h-4 w-48 animate-pulse rounded-sm bg-surface-2" />
        </div>
      ))}
    </Card>
  )
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="h-7 w-56 animate-pulse rounded-sm bg-surface-2" />
      <ListSkeleton />
    </div>
  )
}
