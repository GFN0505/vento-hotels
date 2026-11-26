// The setup steps for a new group (design: OnbHome), from Home's summary and the member's own
// state. Shared by the checklist and Home's "Setup" tile so they always agree.
import { useQuery } from '@tanstack/react-query'
import type { PaymentSetup, TaxSetup } from '@vento/shared'
import { useProperty } from '@/components/shell/property-context'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { ratesStep } from './rates-step'

export type SetupStepKey =
  | 'group'
  | 'hotel'
  | 'details'
  | 'rooms'
  | 'taxes'
  | 'rates'
  | 'team'
  | 'pin'
  | 'devices'
  | 'two-step'

export type SetupStep = {
  key: SetupStepKey
  label: string
  why: string
  done: boolean
  // The hotel the step's link opens on (?hotel=), when it's about one hotel.
  hotel?: string | undefined
}

export function useSetupSteps(): { steps: SetupStep[]; done: number; ready: boolean } {
  const me = useMe()
  const summary = useQuery(orpc.organization.home.queryOptions())
  // The hotel chosen in the top bar (or the last one picked, with All hotels).
  const { current } = useProperty()
  // The chosen hotel's taxes and payment setup, for "Set up taxes and payments".
  const financeOn = me.has('front_desk') && me.can('finance.setup') && Boolean(current)
  const hotelInput = { input: { propertyId: current?.id ?? '' } }
  const taxes = useQuery({ ...orpc.taxes.get.queryOptions(hotelInput), enabled: financeOn })
  const payments = useQuery({
    ...orpc.paymentMethods.get.queryOptions(hotelInput),
    enabled: financeOn,
  })
  const s = summary.data
  if (!s || !me.data) return { steps: [], done: 0, ready: false }
  const steps: SetupStep[] = [
    {
      key: 'group',
      label: 'Create your hotel group',
      why: 'Your group, company and settings',
      done: true,
    },
    {
      key: 'hotel',
      label: 'Add your first hotel',
      why: 'Where rooms, staff and money live',
      done: s.hotels > 0,
    },
    {
      key: 'details',
      label: 'Complete hotel and company details',
      why: 'Address, RC number, TIN and VAT, for invoices and the guest register',
      done: Boolean(
        current?.addressLine1 && current.area && current.lga && !current.entityDetailsMissing,
      ),
    },
    // Only when front desk is switched on for the group (decision 0021).
    ...(me.has('front_desk')
      ? [
          {
            key: 'rooms' as const,
            label: 'Set up rooms',
            why: 'Room types and rooms, so you can sell them',
            done: s.rooms > 0,
          },
          {
            key: 'rates' as const,
            label: 'Set rates',
            why: 'Prices for each room type, so you can take bookings',
            ...ratesStep(s.byHotel, current?.id),
          },
        ]
      : []),
    ...(financeOn
      ? [
          {
            key: 'taxes' as const,
            label: 'Set up taxes and payments',
            why: 'VAT, consumption tax, service charge and where guests pay',
            done: taxesAndPaymentsDone(taxes.data, payments.data),
          },
        ]
      : []),
    {
      key: 'team',
      label: 'Invite your team',
      why: 'Managers and staff, each with their own sign-in',
      done: (s.members ?? 0) > 1 || (s.pendingInvites ?? 0) > 0,
    },
    {
      key: 'pin',
      label: 'Set your staff PIN',
      why: 'Four digits to sign in on shared devices',
      done: me.data.hasPin,
    },
    {
      key: 'devices',
      label: 'Register shared devices',
      why: 'Restaurant tablets, front desk PCs, housekeeping phones',
      done: (s.devices ?? 0) > 0,
    },
    {
      key: 'two-step',
      label: 'Turn on two-step sign-in',
      why: 'A code from your phone keeps your account safe',
      done: me.data.twoStep,
    },
  ]
  return { steps, done: steps.filter((step) => step.done).length, ready: true }
}

// Done when the hotel's taxes are set up and every rate in force is verified, and, with bank
// transfer on, guests have an account to transfer to (spec: "Home, ⌘K and navigation").
export function taxesAndPaymentsDone(
  taxes: TaxSetup | undefined,
  payments: PaymentSetup | undefined,
): boolean {
  if (!taxes?.setUp || !payments) return false
  const verified = taxes.taxes.every((tax) =>
    tax.rates.every((rate) => rate.status !== 'current' || !rate.toVerify),
  )
  const transfer = payments.methods.find((m) => m.method === 'bank_transfer')
  return verified && (!transfer?.enabled || payments.guestTransferAccount !== null)
}
