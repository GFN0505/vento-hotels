// My shift while it's open: who, which drawer, since when, and the float, nothing about takings
// (the count is blind). Count and close starts step 1.
import { clockAt, type OpenShift } from '@vento/shared'
import { EyeOff, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { useOnline } from '@/offline/connection'
import { compareWords, dateLabel, naira } from './format'

export function OpenShiftCard({ shift, onCount }: { shift: OpenShift; onCount: () => void }) {
  const online = useOnline()
  const tz = shift.timeZone
  const handover = shift.handover
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Cashier shift ${shift.number} · ${dateLabel(shift.businessDate)}`}
        badge={<StatusBadge tone="blue">Open</StatusBadge>}
        description={
          <span className="num">
            {shift.member.name} · {shift.drawer.name} · opened {clockAt(shift.openedAt, tz)}
          </span>
        }
        actions={
          <Button variant="primary" size="lg" className="max-sm:w-full" onClick={onCount}>
            Count and close
          </Button>
        }
      />
      <Card className="grid gap-0 overflow-hidden sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex items-center gap-4 border-border p-5 max-sm:border-b sm:border-r">
          <span className="grid size-12 flex-none place-items-center rounded-xl bg-pri-soft text-pri-ink ring-1 ring-pri-line">
            <Wallet className="size-6" aria-hidden="true" strokeWidth={1.7} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm text-text-2">Float</span>
            <span className="num text-[26px] leading-tight font-semibold tracking-[-0.02em]">
              {naira(shift.openingFloat)}
            </span>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-2 p-5">
          <p className="flex items-start gap-2 text-text-2">
            <EyeOff className="mt-0.5 size-4 flex-none text-text-3" aria-hidden="true" />
            Takings stay hidden until you count, so your count is your own.
          </p>
          {handover.fromShift ? (
            <p className="num text-sm text-text-3">
              Handed over by {handover.fromShift.memberName} · {naira(handover.floatLeft)} ·{' '}
              {compareWords(handover.difference).text}
            </p>
          ) : null}
          {shift.terminals.length > 0 ? (
            <p className="text-sm text-text-3">
              POS terminal {shift.terminals.map((t) => t.label).join(', ')}
            </p>
          ) : null}
          {online ? null : (
            <p className="text-sm text-am">Counting can start; submitting needs a connection.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
