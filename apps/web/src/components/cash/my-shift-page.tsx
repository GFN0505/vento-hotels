// My shift (spec: "My shift"): a hotel page. No shift of mine here: the open form. Open: the shift
// card, then the blind count. Counted (submitted, not closed, even after a reload or a locked PIN
// session): step 2, ready to close. My shift at another hotel: where it is, and a way there.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MyShift, ShiftView } from '@vento/shared'
import { AlertTriangle, ArrowRight, CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { PickHotel } from '@/components/shell/pick-hotel'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { CashOffline } from './cash-offline'
import { CloseStep } from './close-step'
import { CountStep } from './count-step'
import { naira } from './format'
import { OpenForm } from './open-form'
import { OpenShiftCard } from './open-shift-card'

export const RUN_SHIFT_ONLY =
  'Only front desk, cashiers and managers can run a cashier shift. Ask your GM.'

export function MyShiftPage() {
  useScopedTitle('Cash')
  const me = useMe()
  const { scope } = useProperty()
  if (me.isPending || !scope) return <ShiftSkeleton />
  if (!me.can('cashier_shift.operate')) {
    return <NoAccess what="cashier shifts" ask={RUN_SHIFT_ONLY} />
  }
  if (scope.kind === 'all') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Cash" scope="pick" />
        <PickHotel title="Cashier shifts are per hotel. Pick a hotel." />
      </div>
    )
  }
  return <HotelShift key={scope.hotel.id} propertyId={scope.hotel.id} />
}

type Step = 'card' | 'count'

function HotelShift({ propertyId }: { propertyId: string }) {
  const client = useQueryClient()
  const query = useQuery(orpc.cash.myShift.queryOptions({ input: { propertyId } }))
  const [step, setStep] = useState<Step>('card')
  const [closed, setClosed] = useState<ShiftView>()
  const key = orpc.cash.myShift.queryKey({ input: { propertyId } })
  const put = (shift: ShiftView | null) =>
    client.setQueryData<MyShift>(key, (data) => (data ? { ...data, shift } : data))

  if (query.isPending) return <ShiftSkeleton />
  if (!query.data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Cash" />
        <EmptyState
          icon={AlertTriangle}
          action={
            <Button
              className="max-lg:h-11"
              onClick={() => query.refetch()}
              loading={query.isFetching}
            >
              Try again
            </Button>
          }
        >
          Your shift didn't load. Nothing changed. Try again.
        </EmptyState>
      </div>
    )
  }
  const data = query.data
  const shift = data.shift

  return (
    <div className="flex flex-col gap-5">
      <CashOffline savedAt={query.dataUpdatedAt} />
      {data.hotel.archived ? (
        <>
          <PageHeader title="Cash" />
          <Card className="p-5 text-text-2">
            This hotel was archived. Its shifts stay readable on Shifts.
          </Card>
        </>
      ) : data.elsewhere ? (
        <Elsewhere elsewhere={data.elsewhere} />
      ) : closed && !shift ? (
        <Closed shift={closed} onNew={() => setClosed(undefined)} />
      ) : !shift ? (
        <OpenForm data={data} onOpened={(opened) => put(opened)} />
      ) : shift.status === 'open' ? (
        step === 'count' ? (
          <CountStep
            shift={shift}
            onCounted={(counted) => put(counted)}
            onBack={() => setStep('card')}
          />
        ) : (
          <OpenShiftCard shift={shift} onCount={() => setStep('count')} />
        )
      ) : shift.status === 'counted' ? (
        <CloseStep
          shift={shift}
          onClosed={(done) => {
            setClosed(done)
            setStep('card')
            put(null)
          }}
        />
      ) : null}
    </div>
  )
}

function Elsewhere({ elsewhere }: { elsewhere: NonNullable<MyShift['elsewhere']> }) {
  const { select } = useProperty()
  return (
    <>
      <PageHeader title="Cash" />
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-text-2">
          Your shift {elsewhere.number} is open at {elsewhere.hotelName} ({elsewhere.drawerName}).
        </p>
        <Button
          variant="primary"
          className="max-lg:h-11"
          onClick={() => select(elsewhere.propertyId, { moveFocus: true })}
        >
          Go to {elsewhere.hotelName}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </Card>
    </>
  )
}

function Closed({ shift, onNew }: { shift: ShiftView; onNew: () => void }) {
  const kept = shift.status === 'closed' ? shift.floatKept : '0.00'
  return (
    <>
      <PageHeader title={`Shift ${shift.number} closed`} />
      <EmptyState
        icon={CircleCheck}
        tone="brand"
        action={
          <Button variant="primary" className="max-lg:h-11" onClick={onNew}>
            Open a new shift
          </Button>
        }
      >
        {shift.drawer.name} is free with {naira(kept)} for the next person.
      </EmptyState>
    </>
  )
}

function ShiftSkeleton() {
  const bar = 'animate-pulse rounded-sm bg-surface-2'
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading your shift"
      className="flex flex-col gap-5"
    >
      <span className={`h-8 w-64 ${bar}`} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
          {['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((row) => (
            <span key={row} className="flex items-center gap-3 px-4 py-3">
              <span className={`h-4 w-16 ${bar}`} />
              <span className={`h-8 w-24 ${bar}`} />
              <span className="grow" />
              <span className={`h-4 w-24 ${bar}`} />
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <span className={`h-4 w-24 ${bar}`} />
          <span className={`h-4 w-full ${bar}`} />
          <span className={`h-4 w-full ${bar}`} />
          <span className={`h-11 w-full ${bar}`} />
        </div>
      </div>
    </div>
  )
}
