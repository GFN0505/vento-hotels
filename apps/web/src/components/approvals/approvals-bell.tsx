// The bell in the top bar (design: InboxBell; spec "Bell and inbox"): how many requests wait for
// you at the selected hotel (every hotel you see with All hotels), polled every 30 seconds and on
// window focus as a background read. The popover lists up to 5 waiting for you, then your own
// requests of today with Continue booking. Approvals only in this brick: no read/unread state.
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ApprovalView, isWaiverSubject, PENALTY_KIND_LABELS } from '@vento/shared'
import { Bell } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useProperty } from '@/components/shell/property-context'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useMe } from '@/lib/me'
import { keepWithinHotel, scopeName, scopePropertyId } from '@/lib/scope'
import { useOnline } from '@/offline/connection'
import { age, yourRequestLine } from './format'

const BELL_POLL_MS = 30_000

export function ApprovalsBell() {
  const me = useMe()
  const { scope } = useProperty()
  const online = useOnline()
  const propertyId = scopePropertyId(scope)
  // The one kind so far is the over-limit discount, which ships with front desk.
  const enabled = me.has('front_desk') && scope !== undefined
  const count = useQuery({
    ...orpc.approvals.count.queryOptions({ input: { propertyId } }),
    enabled: enabled && online,
    refetchInterval: BELL_POLL_MS,
    refetchOnWindowFocus: true,
    placeholderData: keepWithinHotel(propertyId),
    retry: false,
  })
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onOutside(event: Event) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('focusin', onOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('focusin', onOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!enabled) return null
  const waiting = count.data?.waiting ?? 0
  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={
          waiting > 0
            ? `Approvals, ${waiting} waiting for you`
            : 'Approvals, nothing waiting for you'
        }
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-11 place-items-center rounded-md text-text-2 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:size-9"
      >
        <Bell className="size-[18px]" aria-hidden="true" />
        {waiting > 0 ? (
          <span
            aria-hidden="true"
            className="num absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-ro-dot px-1 text-[10px] leading-none font-bold text-white lg:top-0 lg:right-0"
          >
            {waiting > 9 ? '9+' : waiting}
          </span>
        ) : null}
      </button>
      {open ? (
        <BellPanel id={panelId} propertyId={propertyId} onDone={() => setOpen(false)} />
      ) : null}
    </div>
  )
}

function BellPanel({
  id,
  propertyId,
  onDone,
}: {
  id: string
  propertyId: string | undefined
  onDone: () => void
}) {
  const waiting = useQuery(
    orpc.approvals.list.queryOptions({ input: { view: 'waiting', propertyId, pageSize: 5 } }),
  )
  const mine = useQuery(
    orpc.approvals.list.queryOptions({
      input: { view: 'asked', propertyId, today: true, pageSize: 5 },
    }),
  )
  const online = useOnline()
  const { scope } = useProperty()
  const where = scope ? scopeName(scope) : ''
  const hotel = (view: ApprovalView) => ({ hotel: view.propertyId })
  // Never "all caught up" when the list couldn't be read: offline or failed says so.
  const unread = (query: { data?: unknown; isError: boolean }) =>
    query.data === undefined && (!online || query.isError)
  const trouble = !online ? (
    <p className="px-4 pb-3 text-sm text-am">
      You're offline. Approvals show again when you're back.
    </p>
  ) : (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-sm">
      <span className="text-ro">Couldn't load approvals at {where}.</span>
      <button
        type="button"
        onClick={() => {
          void waiting.refetch()
          void mine.refetch()
        }}
        className="inline-flex min-h-11 items-center font-medium text-pri-ink hover:underline lg:min-h-0"
      >
        Try again
      </button>
    </div>
  )
  return (
    <section
      id={id}
      aria-label="Notifications"
      className="absolute top-[calc(100%+6px)] right-0 z-30 flex max-h-[min(560px,calc(100dvh-80px))] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-[var(--shadow-lg)] max-sm:fixed max-sm:top-14 max-sm:right-3"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-semibold">Notifications</h2>
        <Link
          to="/approvals"
          onClick={onDone}
          className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-pri-ink hover:underline lg:min-h-0"
        >
          See all
        </Link>
      </header>
      <div className="overflow-y-auto">
        <h3 className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase">
          Waiting for you
        </h3>
        {unread(waiting) ? (
          trouble
        ) : waiting.isPending ? (
          <span className="mx-4 my-2 block h-12 animate-pulse rounded-sm bg-surface-2" />
        ) : (waiting.data?.items.length ?? 0) === 0 ? (
          <div className="px-4 pb-3">
            <p className="font-medium">Nothing waiting for you</p>
            <p className="text-sm text-text-3">You're all caught up.</p>
          </div>
        ) : (
          <ul>
            {waiting.data?.items.map((view) => (
              <li
                key={view.id}
                className="flex items-start gap-2.5 border-b border-border bg-pri-soft px-4 py-3"
              >
                <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full bg-pri" />
                <div className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="font-medium">
                    {isWaiverSubject(view.subject)
                      ? 'Penalty waiver waiting for you'
                      : `${view.subject.percent}% discount waiting for you`}
                  </span>
                  <span className="num truncate text-sm text-text-2">
                    {view.requester.name} ·{' '}
                    {isWaiverSubject(view.subject)
                      ? `${PENALTY_KIND_LABELS[view.subject.penalty.kind]} · ${view.subject.reservationNumber}`
                      : view.subject.guestName}{' '}
                    · {age(view.requestedAt)}
                  </span>
                  <Link
                    to="/approvals"
                    search={{ id: view.id, ...hotel(view) }}
                    onClick={onDone}
                    className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-pri-ink hover:underline lg:min-h-0"
                  >
                    Review
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {unread(mine) && !unread(waiting) ? (
          <>
            <h3 className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase">
              Your requests
            </h3>
            {trouble}
          </>
        ) : null}
        {(mine.data?.items.length ?? 0) > 0 ? (
          <>
            <h3 className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase">
              Your requests
            </h3>
            <ul>
              {mine.data?.items.map((view) => {
                const resumable =
                  view.status === 'pending' || (view.status === 'approved' && !view.usedAt)
                return (
                  <li
                    key={view.id}
                    className="flex items-start gap-2.5 border-b border-border px-4 py-3 last:border-0"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2 flex-none rounded-full',
                        view.status === 'approved'
                          ? 'bg-em-dot'
                          : view.status === 'pending'
                            ? 'bg-am-dot'
                            : 'bg-sl-dot',
                      )}
                    />
                    <div className="flex min-w-0 grow flex-col gap-0.5">
                      <span className="break-words">{yourRequestLine(view)}</span>
                      <span className="num text-sm text-text-3">{age(view.requestedAt)}</span>
                      {resumable && !view.hotelArchived ? (
                        <Link
                          to="/reservations"
                          search={{ sheet: 'new', approval: view.id, ...hotel(view) }}
                          onClick={onDone}
                          className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-pri-ink hover:underline lg:min-h-0"
                        >
                          Continue booking
                        </Link>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  )
}
