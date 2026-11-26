// People (design #25, SetMembers): search and role filters over the list, which follows the hotel
// switch. Every state names the hotel when there is one; filters stay when the hotel changes.
import type { MemberView, Property, RoleFilter } from '@vento/shared'
import { Search, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { useOnline } from '@/offline/connection'
import { MemberTable } from './member-table'
import { MEMBERS_PAGE_SIZE, type MembersSearch, type OnMembersSearch } from './members-search'
import type { MembersQuery } from './use-members'

const FILTERS: { value: RoleFilter | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'admins', label: 'Owners and admins' },
  { value: 'managers', label: 'Managers' },
  { value: 'staff', label: 'Staff' },
]

type Props = {
  search: MembersSearch
  onSearch: OnMembersSearch
  // The hotel in view (one hotel chosen in a group with several); undefined for the whole group.
  hotel: Property | undefined
  members: MembersQuery
  // Invites still loading: keep the skeleton, so the page settles in one go.
  waiting: boolean
  // Invites not accepted yet (for the hotel in view), mentioned in the note.
  pendingInvites: number
  onEdit: (member: MemberView) => void
  onInvite: () => void
}

export function People(props: Props) {
  const { search, onSearch, hotel, members, onEdit, onInvite } = props
  const online = useOnline()
  const [text, setText] = useState(search.q ?? '')
  const page = search.page ?? 1
  const at = hotel ? ` at ${hotel.name}` : ''

  // Searching waits for a pause in typing, so the list doesn't flicker on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = text.trim() || undefined
      if (q !== search.q) onSearch({ q, page: undefined })
    }, 250)
    return () => clearTimeout(timer)
  }, [text, search.q, onSearch])

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
                onClick={() => onSearch({ filter: option.value, page: undefined })}
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

      {members.isPending || !members.isEnabled || props.waiting ? (
        <PeopleSkeleton />
      ) : members.isError ? (
        <Card className="flex flex-col items-start gap-3 p-5" role="alert">
          <p className="font-medium">
            {hotel
              ? `We couldn't load the people at ${hotel.name}.`
              : "We couldn't load the people in your group."}
          </p>
          <p className="text-text-2">
            {online
              ? problemMessage(members.error)
              : `Not saved on this device yet. Connect to see ${hotel?.name ?? 'your team'}.`}
          </p>
          <Button onClick={() => members.refetch()} loading={members.isFetching}>
            Try again
          </Button>
        </Card>
      ) : members.data.items.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 p-5">
          <p className="font-medium">
            {filtered ? `No one matches these filters${at}.` : 'Nobody here yet'}
          </p>
          {filtered ? (
            <Button
              onClick={() => {
                setText('')
                onSearch({ q: undefined, filter: undefined, page: undefined })
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
          <MemberTable members={members.data.items} onEdit={onEdit} hotelId={hotel?.id} />
          <Note
            hotel={hotel}
            justYou={members.data.total === 1}
            // Everyone at the hotel has whole-group access: nobody works only there yet.
            onlyWholeGroup={members.data.wholeGroup === members.data.total}
            pendingInvites={props.pendingInvites}
            filtered={filtered}
            onInvite={onInvite}
          />
          <Pagination
            page={page}
            pageSize={MEMBERS_PAGE_SIZE}
            total={members.data.total}
            onPage={(next) => onSearch({ page: next })}
          />
        </>
      )}
    </section>
  )
}

// One line under the list when the team is still to be built.
function Note({
  hotel,
  justYou,
  onlyWholeGroup,
  pendingInvites,
  filtered,
  onInvite,
}: {
  hotel: Property | undefined
  justYou: boolean
  onlyWholeGroup: boolean
  pendingInvites: number
  filtered: boolean
  onInvite: () => void
}) {
  if (filtered) return null
  if (!hotel) {
    if (!justYou) return null
    return (
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <p className="grow text-text-2">
          It's just you so far. Invite your managers and front desk to get started.
        </p>
      </Card>
    )
  }
  if (!onlyWholeGroup) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-pri-line bg-pri-soft/50 p-4">
      <span className="grid size-9 flex-none place-items-center rounded-lg bg-pri-soft text-pri-ink">
        <UserPlus className="size-4" aria-hidden="true" />
      </span>
      <p className="min-w-0 grow basis-60">
        <span className="font-medium">Nobody works only at {hotel.name} yet.</span>{' '}
        <span className="text-text-2">
          Invite its managers and staff.
          {pendingInvites > 0
            ? ` ${pendingInvites === 1 ? '1 invite' : `${pendingInvites} invites`} pending.`
            : ''}
        </span>
      </p>
      <Button className="max-lg:h-11" onClick={onInvite}>
        Invite people
      </Button>
    </div>
  )
}

export function PeopleSkeleton({ page = false }: { page?: boolean }) {
  const list = (
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
  if (!page) return list
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="h-7 w-56 animate-pulse rounded-sm bg-surface-2" />
      {list}
    </div>
  )
}
