// POS terminals of the hotel (spec: "POS terminals"): "Moniepoint · Desk 1 · TID 2MPT4471", the
// account it settles into, Active or Archived.
import { useQuery } from '@tanstack/react-query'
import type { PaymentSetup, PosTerminalView } from '@vento/shared'
import { ChevronRight, CreditCard, Plus } from 'lucide-react'
import { useState } from 'react'
import { RowsSkeleton } from '@/components/settings/load-states'
import { type Show, StatusChips } from '@/components/settings/status-chips'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { RestoreButton } from './restore-button'

type Props = {
  setup: PaymentSetup
  canWrite: boolean
  onOpen: (terminal: PosTerminalView) => void
  onAdd: () => void
}

export function TerminalsCard({ setup, canWrite, onOpen, onAdd }: Props) {
  const [show, setShow] = useState<Show>()
  const list = useQuery(
    orpc.posTerminals.list.queryOptions({
      input: { propertyId: setup.property.id, status: show ?? 'active' },
    }),
  )
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="font-semibold">POS terminals</h2>
        <span className="flex flex-wrap items-center gap-2">
          <StatusChips show={show} onShow={setShow} />
          {setup.canEdit ? (
            <Button className="max-lg:h-11" disabled={!canWrite} onClick={onAdd}>
              <Plus className="size-4" aria-hidden="true" />
              Add
            </Button>
          ) : null}
        </span>
      </div>
      {list.isPending ? (
        <RowsSkeleton rows={3} label="Loading POS terminals" />
      ) : list.isError ? (
        <p className="p-5 text-text-2">Couldn't load POS terminals. Nothing changed.</p>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={CreditCard} className="m-4 border-dashed shadow-none">
          {show === 'archived'
            ? 'No archived terminals.'
            : 'No POS terminals yet. Add each terminal the hotel uses, so payments can name it.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {list.data.items.map((terminal) => (
            <li key={terminal.id} className="flex items-center gap-2 px-4 sm:px-5">
              <button
                type="button"
                onClick={() => onOpen(terminal)}
                className="group flex min-h-16 min-w-0 grow items-center gap-3 py-3 text-left"
              >
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span
                    className="truncate font-medium group-hover:text-pri-ink"
                    title={`${terminal.provider} · ${terminal.name}`}
                  >
                    {terminal.provider} · {terminal.name} ·{' '}
                    <span className="num">TID {terminal.terminalId}</span>
                  </span>
                  <span className="num truncate text-sm text-text-2">
                    Settles into {terminal.settlesInto}
                  </span>
                </span>
                <StatusBadge tone={terminal.status === 'active' ? 'emerald' : 'slate'}>
                  {terminal.status === 'active' ? 'Active' : 'Archived'}
                </StatusBadge>
                <ChevronRight className="size-4 flex-none text-text-3" aria-hidden="true" />
              </button>
              {terminal.status === 'archived' && canWrite ? (
                <RestoreButton
                  kind="terminal"
                  id={terminal.id}
                  propertyId={setup.property.id}
                  live={setup.property.live}
                  label={`${terminal.provider} · ${terminal.name}`}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
