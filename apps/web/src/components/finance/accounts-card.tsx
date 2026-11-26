// Bank accounts of the hotel's owning company (spec: "Bank accounts"): masked in the list, shared
// by every hotel the company owns, the guest transfer account marked.
import { useQuery } from '@tanstack/react-query'
import type { BankAccountView, PaymentSetup } from '@vento/shared'
import { ChevronRight, Landmark, Plus } from 'lucide-react'
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
  onOpen: (account: BankAccountView) => void
  onAdd: () => void
}

export function AccountsCard({ setup, canWrite, onOpen, onAdd }: Props) {
  const [show, setShow] = useState<Show>()
  const list = useQuery(
    orpc.bankAccounts.list.queryOptions({
      input: { propertyId: setup.property.id, status: show ?? 'active' },
    }),
  )
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-semibold">Bank accounts</h2>
          <p className="truncate text-sm text-text-2" title={setup.property.entityName}>
            {setup.property.entityName}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <StatusChips show={show} onShow={setShow} />
          {setup.canEditAccounts ? (
            <Button className="max-lg:h-11" disabled={!canWrite} onClick={onAdd}>
              <Plus className="size-4" aria-hidden="true" />
              Add
            </Button>
          ) : null}
        </span>
      </div>
      {list.isPending ? (
        <RowsSkeleton rows={2} label="Loading bank accounts" />
      ) : list.isError ? (
        <p className="p-5 text-text-2">Couldn't load bank accounts. Nothing changed.</p>
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={Landmark} className="m-4 border-dashed shadow-none">
          {show === 'archived'
            ? 'No archived accounts.'
            : `No bank accounts for ${setup.property.entityName} yet.`}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {list.data.items.map((account) => (
            <li key={account.id} className="flex items-center gap-2 px-4 sm:px-5">
              <button
                type="button"
                onClick={() => onOpen(account)}
                className="group flex min-h-16 min-w-0 grow items-center gap-3 py-3 text-left"
              >
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span className="num truncate font-medium group-hover:text-pri-ink">
                    {account.bankName} · ••••{account.last4} · {account.currency}
                  </span>
                  <span className="truncate text-sm text-text-2">{account.accountName}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {account.guestTransferFor.some((h) => h.id === setup.property.id) ? (
                      <StatusBadge tone="emerald">Guest transfers</StatusBadge>
                    ) : null}
                    {account.alsoUsedBy.length > 0 ? (
                      <span className="text-xs text-text-3">
                        Also used by {account.alsoUsedBy.join(', ')}
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronRight className="size-4 flex-none text-text-3" aria-hidden="true" />
              </button>
              {account.status === 'archived' && canWrite ? (
                <RestoreButton
                  kind="account"
                  id={account.id}
                  propertyId={setup.property.id}
                  live={setup.property.live}
                  label={`${account.bankName} ••••${account.last4}`}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
