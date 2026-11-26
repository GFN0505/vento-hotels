// The demo group's taxes, payment setup and FX rates (spec: stage-1-taxes-and-payment-methods.md,
// "Demo seed"). Every rate is illustrative and To verify, except Kora Victoria Island's VAT and Lagos
// consumption tax, marked verified by Kunle Ade ("Illustrative: demo only") so both badges show.
// Nothing here is a statement of current law.
import { addDays, dec, type FxCurrency, newId, toAmount } from '@vento/shared'
import { type Actor, type AuditEvent, recordAuditMany } from '../audit/record.ts'
import {
  bankAccounts,
  fxRates,
  paymentMethodSettings,
  posTerminals,
  taxes,
  taxRates,
} from '../db/schema/finance.ts'
import type { Tx } from '../tenancy/property-views.ts'

type Hotels = Record<'vi' | 'ikeja' | 'abuja' | 'ph', string>
type Companies = Record<'hospitality' | 'abuja' | 'ph', string>

const ALL = ['accommodation', 'food', 'beverage', 'events', 'laundry', 'other']
const STATE_TAX = ['accommodation', 'food', 'beverage', 'events']
const DEFAULT_SOURCE =
  'Vento default · illustrative · verify against the Nigeria Tax Act 2025 before go-live'
const DEMO_SOURCE = 'Illustrative: demo only'

// The last 30 days, ending on the designs' figures, with a small made-up daily drift.
const FX_END: Record<FxCurrency, string> = { USD: '1620', GBP: '1950', EUR: '1870' }
const DRIFT = ['0', '-3.5', '2', '4.25', '-1', '1.5', '-2.75', '3', '0.5', '-4']

export async function seedFinance(
  tx: Tx,
  kunle: Actor,
  ids: { organizationId: string; hotels: Hotels; companies: Companies; businessDate: string },
) {
  const { organizationId, hotels, companies, businessDate } = ids
  const verifiedOn = addDays(businessDate, -13)
  const events: AuditEvent[] = []
  const rate = (
    taxId: string,
    ratePercent: string,
    effectiveFrom: string,
    extra: Partial<typeof taxRates.$inferInsert> = {},
  ) => ({
    organizationId,
    taxId,
    ratePercent,
    categories: STATE_TAX,
    effectiveFrom,
    source: DEFAULT_SOURCE,
    setByName: 'Vento default',
    ...extra,
  })

  // --- Taxes -----------------------------------------------------------------------------------
  const vat = newId()
  const lagos = newId()
  const fct = newId()
  const rivers = newId()
  await tx.insert(taxes).values([
    { id: vat, organizationId, kind: 'vat', name: 'VAT', paidTo: 'NRS' },
    {
      id: lagos,
      organizationId,
      kind: 'state_tax',
      name: 'Lagos consumption tax',
      paidTo: 'Lagos State IRS',
      stateCode: 'LA',
    },
    {
      id: fct,
      organizationId,
      kind: 'state_tax',
      name: 'FCT consumption tax',
      paidTo: 'FCT IRS',
      stateCode: 'FC',
    },
    {
      id: rivers,
      organizationId,
      kind: 'state_tax',
      name: 'Rivers consumption tax',
      paidTo: 'Rivers State IRS',
      stateCode: 'RI',
    },
  ])
  const serviceCharges = Object.fromEntries(
    (Object.keys(hotels) as (keyof Hotels)[]).map((key) => [key, newId()]),
  ) as Hotels
  await tx.insert(taxes).values(
    (Object.keys(hotels) as (keyof Hotels)[]).map((key) => ({
      id: serviceCharges[key],
      organizationId,
      kind: 'service_charge' as const,
      name: 'Service charge',
      propertyId: hotels[key],
    })),
  )
  const verified = {
    verifiedByMemberId: kunle.memberId,
    verifiedByName: kunle.userName,
    verifiedOn,
    verifiedSource: DEMO_SOURCE,
  }
  await tx.insert(taxRates).values([
    rate(vat, '5', '1994-01-01', { categories: ALL }),
    rate(vat, '7.5', '2020-02-01', { categories: ALL, ...verified }),
    rate(lagos, '5', '2025-01-01', verified),
    rate(fct, '5', '2025-01-01'),
    rate(rivers, '5', '2025-01-01'),
    ...Object.values(serviceCharges).map((id) => rate(id, '10', '2025-01-01')),
    // Scheduled at Kora Victoria Island, so the Scheduled state shows.
    rate(serviceCharges.vi, '12.5', '2027-01-01', {
      source: 'Board meeting, 20 Oct 2026',
      reason: 'Staff pool review',
      setByMemberId: kunle.memberId,
      setByName: kunle.userName,
    }),
  ])
  events.push(
    {
      action: 'tax_rate.scheduled',
      entityType: 'tax',
      entityId: serviceCharges.vi,
      propertyId: hotels.vi,
      businessDate,
      reason: 'Staff pool review',
      after: {
        taxName: 'Service charge',
        rate: '12.5%',
        effectiveFrom: '2027-01-01',
        liveProperty: true,
        exception: 'setup_changed',
      },
    },
    {
      action: 'tax_rate.verified',
      entityType: 'tax',
      entityId: vat,
      businessDate: verifiedOn,
      after: { taxName: 'VAT', rate: '7.5%', source: DEMO_SOURCE, verifiedOn },
    },
    {
      action: 'tax_rate.verified',
      entityType: 'tax',
      entityId: lagos,
      businessDate: verifiedOn,
      after: { taxName: 'Lagos consumption tax', rate: '5%', source: DEMO_SOURCE, verifiedOn },
    },
  )

  // --- Bank accounts ---------------------------------------------------------------------------
  const zenith = newId()
  const zenithUsd = newId()
  const abujaAccount = newId()
  const phAccount = newId()
  const accounts = [
    {
      id: zenith,
      entityId: companies.hospitality,
      bankName: 'Zenith Bank',
      accountNumber: '0123454471',
      accountName: 'Kora Hospitality Ltd',
      currency: 'NGN',
    },
    {
      id: zenithUsd,
      entityId: companies.hospitality,
      bankName: 'Zenith Bank',
      accountNumber: '0123459012',
      accountName: 'Kora Hospitality Ltd',
      currency: 'USD',
    },
    {
      id: abujaAccount,
      entityId: companies.abuja,
      bankName: 'Access Bank',
      accountNumber: '0690001122',
      accountName: 'Kora Hotels Abuja Ltd',
      currency: 'NGN',
    },
    {
      id: phAccount,
      entityId: companies.ph,
      bankName: 'Guaranty Trust Bank',
      accountNumber: '0234567788',
      accountName: 'Kora PH Ltd',
      currency: 'NGN',
    },
  ]
  await tx.insert(bankAccounts).values(accounts.map((account) => ({ organizationId, ...account })))
  for (const account of accounts) {
    events.push({
      action: 'bank_account.created',
      entityType: 'bank_account',
      entityId: account.id,
      businessDate,
      after: {
        account: `${account.bankName} ••••${account.accountNumber.slice(-4)}`,
        currency: account.currency,
      },
    })
  }

  // --- Payment methods: cash takes dollars and pounds at Victoria Island; Zenith ••••4471 takes
  // guest transfers for both Lagos hotels.
  await tx.insert(paymentMethodSettings).values([
    {
      organizationId,
      propertyId: hotels.vi,
      method: 'cash',
      enabled: true,
      foreignCurrencies: ['USD', 'GBP'],
    },
    {
      organizationId,
      propertyId: hotels.vi,
      method: 'bank_transfer',
      enabled: true,
      guestTransferAccountId: zenith,
    },
    {
      organizationId,
      propertyId: hotels.ikeja,
      method: 'bank_transfer',
      enabled: true,
      guestTransferAccountId: zenith,
    },
  ])

  // --- POS terminals ---------------------------------------------------------------------------
  const terminals = [
    {
      propertyId: hotels.vi,
      provider: 'Moniepoint',
      name: 'Desk 1',
      terminalId: '2MPT4471',
      bankAccountId: zenith,
    },
    {
      propertyId: hotels.vi,
      provider: 'Moniepoint',
      name: 'Calabash',
      terminalId: '2MPT4472',
      bankAccountId: zenith,
    },
    {
      propertyId: hotels.vi,
      provider: 'OPay',
      name: 'Pool bar',
      terminalId: '3OPY7709',
      bankAccountId: zenith,
    },
    {
      propertyId: hotels.ikeja,
      provider: 'Moniepoint',
      name: 'Desk 1',
      terminalId: '2MPT5101',
      bankAccountId: zenith,
    },
    {
      propertyId: hotels.abuja,
      provider: 'Moniepoint',
      name: 'Desk 1',
      terminalId: '2MPT6201',
      bankAccountId: abujaAccount,
    },
    {
      propertyId: hotels.ph,
      provider: 'Moniepoint',
      name: 'Desk 1',
      terminalId: '2MPT7301',
      bankAccountId: phAccount,
    },
  ].map((terminal) => ({ id: newId(), organizationId, ...terminal }))
  await tx.insert(posTerminals).values(terminals)
  for (const terminal of terminals) {
    events.push({
      action: 'pos_terminal.created',
      entityType: 'pos_terminal',
      entityId: terminal.id,
      propertyId: terminal.propertyId,
      businessDate,
      after: { terminal: `${terminal.provider} · ${terminal.name} (TID ${terminal.terminalId})` },
    })
  }

  // --- FX rates: the 30 days to the business date, entered by Kunle Ade --------------------------
  const rows: (typeof fxRates.$inferInsert)[] = []
  for (const currency of Object.keys(FX_END) as FxCurrency[]) {
    for (let back = 29; back >= 0; back--) {
      const drift = back === 0 ? dec('0') : dec(DRIFT[back % DRIFT.length] ?? '0')
      rows.push({
        organizationId,
        currency,
        rateDate: addDays(businessDate, -back),
        rate: toAmount(
          dec(FX_END[currency])
            .plus(drift)
            .plus(dec(String(back)).times('0.5')),
        ),
        source: 'cbn',
        enteredByMemberId: kunle.memberId,
        enteredByName: kunle.userName,
      })
    }
  }
  await tx.insert(fxRates).values(rows)
  events.push({
    action: 'fx_rate.entered',
    entityType: 'fx_rate',
    businessDate,
    after: { currency: 'USD', rateDate: businessDate, rate: FX_END.USD, source: 'cbn' },
  })
  await recordAuditMany(tx, kunle, events)
}
