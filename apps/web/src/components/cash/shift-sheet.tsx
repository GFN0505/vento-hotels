// One shift, in a side sheet (spec: "Shift detail"): the opening count by note and the hand-over;
// once submitted, the count by line with expected, counted and difference; reasons, who approved
// and how, the float kept, the safe drop and bag; who, where and the business dates; the audit
// trail. An open shift shows its float and "Counted blind at close", nothing else.
import { useQuery } from '@tanstack/react-query'
import { type ApprovedBy, clockAt, dec, SHIFT_STATUS_LABELS, type ShiftView } from '@vento/shared'
import type { ReactNode } from 'react'
import { LoadError } from '@/components/settings/load-states'
import { Sheet } from '@/components/ui/sheet'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { problemMessage } from '@/lib/errors'
import {
  compareWords,
  dateLabel,
  differenceLine,
  foreignShort,
  naira,
  STATUS_TONE,
  shiftLabel,
} from './format'
import { NoteCount } from './note-count'
import { TakingsTable } from './takings-table'

const EVENT_LABELS: Record<string, string> = {
  'cashier_shift.opened': 'Opened',
  'cashier_shift.count_submitted': 'Count submitted',
  'cashier_shift.closed': 'Closed',
  'approval.requested': 'Approval asked',
  'approval.granted': 'Approved',
  'approval.declined': 'Declined',
  'approval.cancelled': 'Request cancelled',
  'approval.expired': 'Request expired',
}

const how = (by: ApprovedBy, tz: string) =>
  `${by.name} · ${by.method === 'pin_here' ? `PIN${by.deviceName ? ` on ${by.deviceName}` : ''}` : 'inbox'} · ${clockAt(by.at, tz)}`

export function ShiftSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useQuery(orpc.cash.shifts.get.queryOptions({ input: { id } }))
  const shift = detail.data?.shift
  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={shift ? `${shiftLabel(shift)} · ${shift.drawer.name}` : 'Shift'}
      description={
        shift ? `${shift.member.name} · ${SHIFT_STATUS_LABELS[shift.status]}` : undefined
      }
    >
      {detail.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading the shift"
          className="flex flex-col gap-3"
        >
          <span className="h-24 animate-pulse rounded-sm bg-surface-2" />
          <span className="h-40 animate-pulse rounded-sm bg-surface-2" />
        </div>
      ) : !detail.data || !shift ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-ro">
            {problemMessage(detail.error)}
          </p>
          <LoadError onRetry={() => detail.refetch()} retrying={detail.isFetching} />
        </div>
      ) : (
        <Detail shift={shift} events={detail.data.events} />
      )}
    </Sheet>
  )
}

function Detail({
  shift,
  events,
}: {
  shift: ShiftView
  events: {
    id: string
    action: string
    actorName: string | null
    deviceName: string | null
    at: string
    reason: string | null
  }[]
}) {
  const tz = shift.timeZone
  const handover = shift.handover
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={STATUS_TONE[shift.status]}>
          {SHIFT_STATUS_LABELS[shift.status]}
        </StatusBadge>
        {shift.status === 'closed' ? (
          <span className="num text-sm text-text-2">
            {differenceLine(shift.lines, shift.totalDifference)}
          </span>
        ) : null}
      </div>
      <Facts>
        <Fact label="Opened">
          {clockAt(shift.openedAt, tz)} · business date {dateLabel(shift.businessDate)}
          {shift.deviceName ? ` · ${shift.deviceName}` : ''}
        </Fact>
        <Fact label="Float">{naira(shift.openingFloat)}</Fact>
        <Fact label="Hand-over">
          {handover.fromShift
            ? `From ${handover.fromShift.memberName} · shift ${handover.fromShift.number} of ${dateLabel(handover.fromShift.businessDate, false)} · ${naira(handover.floatLeft)} · ${compareWords(handover.difference).text}`
            : 'First shift on the drawer'}
        </Fact>
        {handover.reason ? <Fact label="Hand-over reason">{handover.reason}</Fact> : null}
        {handover.approvedBy ? (
          <Fact label="Hand-over approved by">{how(handover.approvedBy, tz)}</Fact>
        ) : null}
        {shift.status === 'open' ? <Fact label="Count">Counted blind at close</Fact> : null}
        {shift.status !== 'open' ? (
          <Fact label="Count submitted">
            {clockAt(shift.countedAt, tz)} · business date {dateLabel(shift.countedBusinessDate)}
          </Fact>
        ) : null}
        {shift.status === 'closed' ? (
          <>
            <Fact label="Closed">
              {clockAt(shift.closedAt, tz)} · business date {dateLabel(shift.closedBusinessDate)}
            </Fact>
            {shift.closeReason ? <Fact label="Reason">{shift.closeReason}</Fact> : null}
            {shift.closeApproval ? (
              <Fact label="Approved by">{how(shift.closeApproval, tz)}</Fact>
            ) : null}
            <Fact label="Float kept">{naira(shift.floatKept)}</Fact>
            <Fact
              label={
                shift.dropBagNumber ? `To the safe · bag ${shift.dropBagNumber}` : 'To the safe'
              }
            >
              {[
                naira(shift.dropNgn),
                ...shift.lines
                  .filter(
                    (l) =>
                      l.kind === 'cash' && l.currency !== 'NGN' && dec(l.counted).greaterThan(0),
                  )
                  .map((l) => foreignShort(l.counted, l.currency)),
              ].join(' · ')}
            </Fact>
          </>
        ) : null}
      </Facts>
      <NoteCount
        title="Opening count"
        hint="by note"
        totalLabel="Float counted"
        count={shift.openingCount}
      />
      {shift.status !== 'open' ? (
        <TakingsTable lines={shift.lines} openingFloat={shift.openingFloat} />
      ) : null}
      {events.length > 0 ? (
        <section aria-labelledby="shift-history" className="flex flex-col gap-2">
          <h3 id="shift-history" className="font-semibold">
            History
          </h3>
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                <span className="font-medium">{EVENT_LABELS[event.action] ?? event.action}</span>
                <span className="num text-text-2">
                  {[
                    event.actorName,
                    event.deviceName,
                    `${dateLabel(event.at.slice(0, 10), false)} ${clockAt(event.at, tz)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {event.reason ? (
                  <span className="break-words text-text-3">“{event.reason}”</span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-sm text-text-3">{label}</dt>
      <dd className="num break-words">{children}</dd>
    </div>
  )
}
