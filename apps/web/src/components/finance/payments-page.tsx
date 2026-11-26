// Settings › Payments (design #27 PayMethods, with the spec's departures): what the desk can take,
// where guests transfer to, and the hotel's POS terminals. A hotel page. Configuration only.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { BankAccountView, PaymentSetup, PosTerminalView } from '@vento/shared'
import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { RowsSkeleton } from '@/components/settings/load-states'
import { SettingsOffline } from '@/components/settings/offline-note'
import { PickHotel } from '@/components/shell/pick-hotel'
import { useProperty } from '@/components/shell/property-context'
import { useScopedTitle } from '@/components/shell/use-scoped-title'
import { NoAccess } from '@/components/team/no-access'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { useOnline } from '@/offline/connection'
import { AccountsCard } from './accounts-card'
import { BankAccountSheet } from './bank-account-sheet'
import { FinanceLoadError } from './load-error'
import { MethodsCard } from './methods-card'
import { TAXES_OFFLINE } from './taxes-page'
import { TerminalSheet } from './terminal-sheet'
import { TerminalsCard } from './terminals-card'

export function PaymentsPage() {
  useScopedTitle('Payments')
  const me = useMe()
  const { current, allHotels, scope, ready } = useProperty()
  if (me.isPending || (!scope && !ready)) return <RowsSkeleton rows={4} label="Loading payments" />
  if (!(me.can('finance.setup') || me.can('rooms.setup') || me.can('fx.enter'))) {
    return (
      <NoAccess
        what="payment setup"
        ask="Only finance or the owner can change taxes and payment setup. Ask your finance team."
      />
    )
  }
  if (allHotels) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          scope="pick"
          title="Payments"
          description="Payment methods, bank accounts and POS terminals for each hotel."
        />
        <PickHotel title="Payments are set per hotel. Pick a hotel." />
      </div>
    )
  }
  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Payments" />
        <EmptyState icon={Building2} tone="brand">
          You're not on a hotel yet. An owner can give you access from Settings.
        </EmptyState>
      </div>
    )
  }
  return <HotelPayments key={current.id} propertyId={current.id} />
}

export type PaymentSheet =
  | { kind: 'account'; account?: BankAccountView }
  | { kind: 'terminal'; terminal?: PosTerminalView }

function HotelPayments({ propertyId }: { propertyId: string }) {
  const online = useOnline()
  const client = useQueryClient()
  const query = useQuery(orpc.paymentMethods.get.queryOptions({ input: { propertyId } }))
  const [sheet, setSheet] = useState<PaymentSheet>()
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: orpc.paymentMethods.key() }),
      client.invalidateQueries({ queryKey: orpc.bankAccounts.key() }),
      client.invalidateQueries({ queryKey: orpc.posTerminals.key() }),
    ])
  const saved = (setup: PaymentSetup) =>
    client.setQueryData(orpc.paymentMethods.get.queryKey({ input: { propertyId } }), setup)

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Payments" />
        <Card>
          <RowsSkeleton rows={5} label="Loading payment settings" />
        </Card>
      </div>
    )
  }
  if (query.isError && !query.data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Payments" />
        <FinanceLoadError
          title="Couldn't load payment settings"
          body="Nothing changed. The desk keeps taking payments as before."
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    )
  }
  const setup = query.data
  const canWrite = setup.canEdit && online
  return (
    <div className="flex flex-col gap-5">
      <SettingsOffline note={TAXES_OFFLINE} />
      <PageHeader
        title="Payments"
        description={`${setup.property.name} · what the desk can take, where guests transfer to, and the hotel's POS terminals`}
      />
      <MethodsCard setup={setup} canWrite={canWrite} onSaved={saved} />
      <div className="grid gap-5 xl:grid-cols-2">
        <AccountsCard
          setup={setup}
          canWrite={canWrite && setup.canEditAccounts}
          onOpen={(account) => setSheet({ kind: 'account', account })}
          onAdd={() => setSheet({ kind: 'account' })}
        />
        <TerminalsCard
          setup={setup}
          canWrite={canWrite}
          onOpen={(terminal) => setSheet({ kind: 'terminal', terminal })}
          onAdd={() => setSheet({ kind: 'terminal' })}
        />
      </div>
      {sheet?.kind === 'account' ? (
        <BankAccountSheet
          setup={setup}
          account={sheet.account}
          onSaved={refresh}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
      {sheet?.kind === 'terminal' ? (
        <TerminalSheet
          setup={setup}
          terminal={sheet.terminal}
          onSaved={refresh}
          onClose={() => setSheet(undefined)}
        />
      ) : null}
    </div>
  )
}
