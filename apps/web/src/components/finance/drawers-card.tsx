// Cash drawers of the hotel (spec: "Drawers"; pattern of the POS terminals card): each drawer, the
// POS terminals at it and who has it now ("Shift 1 open · Chiamaka Eze", or "Free · ₦50,000.00
// float"). Finance and the owner add, edit, archive and restore; GMs read.
import { useQuery } from '@tanstack/react-query'
import { type DrawerView, formatMoney, type PaymentSetup } from '@vento/shared'
import { ChevronRight, Inbox, Plus } from 'lucide-react'
import { useState } from 'react'
import { RowsSkeleton } from '@/components/settings/load-states'
import { type Show, StatusChips } from '@/components/settings/status-chips'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { DrawerRestore } from './drawer-sheet'

type Props = {
  setup: PaymentSetup
  canWrite: boolean
  onOpen: (drawer: DrawerView) => void
  onAdd: () => void
}

export const nowLabel = (drawer: DrawerView) =>
  drawer.now.kind === 'busy'
    ? `Shift ${drawer.now.number} open · ${drawer.now.memberName}`
    : `Free · ${formatMoney({ amount: drawer.now.floatLeft, currency: 'NGN' })} float`

export function DrawersCard({ setup, canWrite, onOpen, onAdd }: Props) {
  const [show, setShow] = useState<Show>()
  const list = useQuery(
    orpc.cash.drawers.list.queryOptions({
      input: { propertyId: setup.property.id, status: show ?? 'active' },
    }),
  )
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-col">
          <h2 className="font-semibold">Cash drawers</h2>
          <p className="text-sm text-text-2">
            Where cash is kept at the desk. Each shift is opened on one.
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <StatusChips show={show} onShow={setShow} />
          {setup.canEdit ? (
            <Button className="max-lg:h-11" disabled={!canWrite} onClick={onAdd}>
              <Plus className="size-4" aria-hidden="true" />
              Add drawer
            </Button>
          ) : null}
        </span>
      </div>
      {list.isPending ? (
        <RowsSkeleton rows={2} label="Loading cash drawers" />
      ) : list.isError ? (
        <p className="p-5 text-text-2">Couldn't load cash drawers. Nothing changed.</p>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={Inbox} className="m-4 border-dashed shadow-none">
          {show === 'archived' ? 'No archived drawers.' : 'No cash drawers yet.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {list.data.items.map((drawer) => (
            <li key={drawer.id} className="flex items-center gap-2 px-4 sm:px-5">
              <button
                type="button"
                onClick={() => onOpen(drawer)}
                className="group flex min-h-16 min-w-0 grow items-center gap-3 py-3 text-left"
              >
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span
                    className="truncate font-medium group-hover:text-pri-ink"
                    title={drawer.name}
                  >
                    {drawer.name}
                  </span>
                  <span className="truncate text-sm text-text-2">
                    {drawer.terminals.length > 0
                      ? drawer.terminals.map((t) => t.label).join(', ')
                      : 'No POS terminal'}
                  </span>
                  {drawer.status === 'active' ? (
                    <span className="num flex items-center gap-1.5 text-sm">
                      <span
                        aria-hidden="true"
                        className={`size-1.5 flex-none rounded-full ${drawer.now.kind === 'busy' ? 'bg-bl-dot' : 'bg-em-dot'}`}
                      />
                      {nowLabel(drawer)}
                    </span>
                  ) : null}
                </span>
                {drawer.status === 'archived' ? (
                  <StatusBadge tone="slate">Archived</StatusBadge>
                ) : null}
                <ChevronRight className="size-4 flex-none text-text-3" aria-hidden="true" />
              </button>
              {drawer.status === 'archived' && canWrite ? (
                <DrawerRestore drawer={drawer} propertyId={setup.property.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
