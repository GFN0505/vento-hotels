// Payment methods, bank accounts and POS terminals through the real HTTP flow
// (spec: docs/specs/stage-1-taxes-and-payment-methods.md, "Payments").
import type { BankAccountView, PaymentSetup, PosTerminalView } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from '../test/harness.ts'
import {
  events,
  type KoraFinance,
  koraFinance,
  type Page,
  type Problem,
  setHotel,
} from './testing.ts'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('payment setup', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())
  let k: KoraFinance
  let zenith: BankAccountView

  const setup = async (cookie: string, propertyId: string) =>
    (await t.rpc<PaymentSetup>(cookie, 'paymentMethods/get', { propertyId })).data
  const method = (s: PaymentSetup, name: string) => s.methods.find((m) => m.method === name)

  beforeAll(async () => {
    k = await koraFinance(t)
    const created = await t.rpc<BankAccountView>(k.finance.cookie, 'bankAccounts/create', {
      propertyId: k.vi.id,
      bankName: 'Zenith Bank',
      accountNumber: '0123 454 471',
      accountName: 'Kora Hospitality Ltd',
      currency: 'NGN',
      guestTransfer: true,
    })
    expect(created.status).toBe(200)
    zenith = created.data
  })

  it('starts a hotel with cash, transfer, POS and city ledger on, and online card off', async () => {
    const ikeja = await setup(k.finance.cookie, k.ikeja.id)
    expect(ikeja.methods.map((m) => [m.method, m.enabled])).toEqual([
      ['cash', true],
      ['bank_transfer', true],
      ['pos_terminal', true],
      ['city_ledger', true],
      ['card_online', false],
    ])
    expect(method(ikeja, 'bank_transfer')?.warnings).toEqual(['No account for guest transfers'])
  })

  it('makes the new account Victoria Island’s guest transfer account, shared with Ikeja', async () => {
    expect(zenith).toMatchObject({
      bankName: 'Zenith Bank',
      accountNumber: '0123454471',
      last4: '4471',
      guestTransferFor: [{ id: k.vi.id, name: 'Kora Victoria Island' }],
      alsoUsedBy: ['Kora Ikeja GRA'],
    })
    const vi = await setup(k.finance.cookie, k.vi.id)
    expect(vi.guestTransferAccount?.id).toBe(zenith.id)
    expect(method(vi, 'bank_transfer')?.warnings).toEqual([])
    const [event] = await events(t, k.owner, { entityType: 'property', entityId: k.vi.id })
    expect(event).toMatchObject({
      action: 'property.transfer_account_set',
      actorName: 'Kunle Ade',
      after: { account: 'Zenith Bank ••••4471', liveProperty: false },
    })
  })

  it('shows account numbers in full only to people who may change them', async () => {
    const page = await t.rpc<Page<BankAccountView>>(k.gm.cookie, 'bankAccounts/list', {
      propertyId: k.vi.id,
    })
    expect(page.data.items[0]).toMatchObject({ accountNumber: '••••4471', canEdit: false })
  })

  it('refuses a bank account the group already has, and a short account number', async () => {
    const taken = await t.rpc<Problem>(k.finance.cookie, 'bankAccounts/create', {
      propertyId: k.ph.id,
      bankName: 'zenith bank',
      accountNumber: '0123454471',
      accountName: 'Kora PH Ltd',
      currency: 'NGN',
    })
    expect(taken.data.message).toBe(
      'Zenith Bank ••••4471 is already set up for Kora Hospitality Ltd.',
    )
    const short = await t.rpc<Problem>(k.finance.cookie, 'bankAccounts/create', {
      propertyId: k.ph.id,
      bankName: 'Access Bank',
      accountNumber: '01234',
      accountName: 'Kora PH Ltd',
      currency: 'NGN',
    })
    expect(short.status).toBe(400)
  })

  it('takes foreign cash and says when there is no rate for it yet', async () => {
    const saved = await t.rpc<PaymentSetup>(k.finance.cookie, 'paymentMethods/set', {
      propertyId: k.vi.id,
      method: 'cash',
      enabled: true,
      foreignCurrencies: ['GBP', 'USD'],
    })
    expect(method(saved.data, 'cash')).toMatchObject({
      currencies: ['NGN', 'USD', 'GBP'],
      warnings: [
        "No USD rate yet. Enter today's FX rates.",
        "No GBP rate yet. Enter today's FX rates.",
      ],
    })
    const [event] = await events(t, k.owner, { entityType: 'property', entityId: k.vi.id })
    expect(event).toMatchObject({
      action: 'payment_method.changed',
      before: { method: 'cash', foreignCurrencies: [] },
      after: { method: 'cash', foreignCurrencies: ['USD', 'GBP'] },
    })
  })

  it('keeps at least one method on, and online card off until online payments', async () => {
    for (const m of ['cash', 'bank_transfer', 'pos_terminal']) {
      await t.rpc(k.finance.cookie, 'paymentMethods/set', {
        propertyId: k.ph.id,
        method: m,
        enabled: false,
      })
    }
    const last = await t.rpc<Problem>(k.finance.cookie, 'paymentMethods/set', {
      propertyId: k.ph.id,
      method: 'city_ledger',
      enabled: false,
    })
    expect(last.data).toMatchObject({
      message: 'Keep at least one payment method on.',
      data: { code: 'LAST_METHOD' },
    })
    const online = await t.rpc<Problem>(k.finance.cookie, 'paymentMethods/set', {
      propertyId: k.ph.id,
      method: 'card_online',
      enabled: true,
    })
    expect(online.data.data?.code).toBe('NOT_YET_AVAILABLE')
  })

  it('registers POS terminals that settle into a naira account, unique by terminal ID', async () => {
    const desk = await t.rpc<PosTerminalView>(k.finance.cookie, 'posTerminals/create', {
      propertyId: k.vi.id,
      provider: 'Moniepoint',
      name: 'Desk 1',
      terminalId: '2mpt4471',
      bankAccountId: zenith.id,
    })
    expect(desk.data).toMatchObject({
      terminalId: '2MPT4471',
      settlesInto: 'Zenith Bank ••••4471',
      status: 'active',
    })
    const again = await t.rpc<Problem>(k.finance.cookie, 'posTerminals/create', {
      propertyId: k.ikeja.id,
      provider: 'OPay',
      name: 'Bar',
      terminalId: '2MPT4471',
      bankAccountId: zenith.id,
    })
    expect(again.data.message).toBe('Terminal 2MPT4471 is already set up at Kora Victoria Island.')
    const usd = await t.rpc<BankAccountView>(k.finance.cookie, 'bankAccounts/create', {
      propertyId: k.vi.id,
      bankName: 'Zenith Bank',
      accountNumber: '0123459012',
      accountName: 'Kora Hospitality Ltd',
      currency: 'USD',
    })
    const wrong = await t.rpc<Problem>(k.finance.cookie, 'posTerminals/create', {
      propertyId: k.vi.id,
      provider: 'OPay',
      name: 'Pool bar',
      terminalId: '3OPY7709',
      bankAccountId: usd.data.id,
    })
    expect(wrong.data.message).toBe("Choose one of Kora Hospitality Ltd's naira accounts.")
  })

  it('won’t archive the guest transfer account or one a terminal settles into', async () => {
    const blocked = await t.rpc<Problem>(k.finance.cookie, 'bankAccounts/archive', {
      propertyId: k.vi.id,
      id: zenith.id,
    })
    expect(blocked.data.message).toBe(
      "Zenith Bank ••••4471 is where Kora Victoria Island's guests pay transfers. Choose another account first.",
    )
    await t.rpc(k.finance.cookie, 'bankAccounts/update', {
      propertyId: k.vi.id,
      id: zenith.id,
      version: zenith.version,
      bankName: 'Zenith Bank',
      accountNumber: '0123454471',
      accountName: 'Kora Hospitality Ltd',
      currency: 'NGN',
      guestTransfer: false,
    })
    const terminalBlocked = await t.rpc<Problem>(k.finance.cookie, 'bankAccounts/archive', {
      propertyId: k.vi.id,
      id: zenith.id,
    })
    expect(terminalBlocked.data.message).toBe(
      'Moniepoint · Desk 1 settles into this account. Point it to another account first.',
    )
  })

  it('needs a reason on a live hotel, flags the change, and emails the owners when the transfer account changes', async () => {
    await setHotel(t, k.vi.id, { liveSince: '2026-11-16' })
    const fields = {
      propertyId: k.vi.id,
      bankName: 'Access Bank',
      accountNumber: '0690000398',
      accountName: 'Kora Hospitality Ltd',
      currency: 'NGN',
      guestTransfer: true,
    }
    const noReason = await t.rpc<Problem>(k.finance.cookie, 'bankAccounts/create', fields)
    expect(noReason.data.data?.code).toBe('REASON_REQUIRED')
    const access = await t.rpc<BankAccountView>(k.finance.cookie, 'bankAccounts/create', {
      ...fields,
      reason: 'Moving deposits to Access',
    })
    expect(access.status).toBe(200)
    const [event] = await events(t, k.owner, { entityType: 'property', entityId: k.vi.id })
    expect(event).toMatchObject({
      action: 'property.transfer_account_set',
      reason: 'Moving deposits to Access',
      after: { account: 'Access Bank ••••0398', exception: 'setup_changed', liveProperty: true },
    })
    const mail = t.email.lastTo(k.owner.email)
    expect(mail?.subject).toBe('Guest transfer account changed at Kora Victoria Island')
    expect(mail?.text).toContain("Kunle Ade changed the account Kora Victoria Island's guests")
    expect(mail?.text).toContain('→ Access Bank ••••0398. Reason: Moving deposits to Access.')
    await setHotel(t, k.vi.id, { liveSince: null })
  })

  it('keeps finance limited to one hotel to that hotel, and away from a company with other hotels', async () => {
    const elsewhere = await t.rpc<Problem>(k.viFinance.cookie, 'posTerminals/create', {
      propertyId: k.ikeja.id,
      provider: 'OPay',
      name: 'Bar',
      terminalId: 'X1',
      bankAccountId: zenith.id,
    })
    expect(elsewhere.data.data?.code).toBe('PROPERTY_NOT_FOUND')
    const company = await t.rpc<Problem>(k.viFinance.cookie, 'bankAccounts/create', {
      propertyId: k.vi.id,
      bankName: 'Wema Bank',
      accountNumber: '0000000001',
      accountName: 'Kora Hospitality Ltd',
      currency: 'NGN',
    })
    expect(company.data.data?.code).toBe('GROUP_ACCESS_NEEDED')
    const terminal = await t.rpc<PosTerminalView>(k.viFinance.cookie, 'posTerminals/create', {
      propertyId: k.vi.id,
      provider: 'OPay',
      name: 'Pool bar',
      terminalId: '3OPY7709',
      bankAccountId: zenith.id,
    })
    expect(terminal.status).toBe(200)
  })

  it('answers not found for another group’s accounts and terminals, and refuses front desk', async () => {
    const other = await t.rpc<Problem>(k.finance.cookie, 'bankAccounts/archive', {
      propertyId: k.otherHotel.id,
      id: zenith.id,
    })
    expect(other.data.data?.code).toBe('PROPERTY_NOT_FOUND')
    const foreign = await t.rpc<Problem>(k.other.cookie, 'paymentMethods/get', {
      propertyId: k.vi.id,
    })
    expect(foreign.status).toBe(404)
    const crossId = await t.rpc<Problem>(k.other.cookie, 'bankAccounts/archive', {
      propertyId: k.otherHotel.id,
      id: zenith.id,
    })
    expect(crossId.status).toBe(404)
    expect(
      (await t.rpc(k.frontDesk.cookie, 'paymentMethods/get', { propertyId: k.vi.id })).status,
    ).toBe(403)
  })

  it('archives and restores a terminal with audit events', async () => {
    const list = await t.rpc<Page<PosTerminalView>>(k.finance.cookie, 'posTerminals/list', {
      propertyId: k.vi.id,
    })
    const pool = list.data.items.find((item) => item.name === 'Pool bar')
    const archived = await t.rpc<PosTerminalView>(k.finance.cookie, 'posTerminals/archive', {
      propertyId: k.vi.id,
      id: pool?.id,
    })
    expect(archived.data.status).toBe('archived')
    const reuse = await t.rpc<Problem>(k.finance.cookie, 'posTerminals/create', {
      propertyId: k.vi.id,
      provider: 'OPay',
      name: 'Pool bar 2',
      terminalId: '3OPY7709',
      bankAccountId: zenith.id,
    })
    expect(reuse.data.message).toBe(
      'Terminal 3OPY7709 belongs to an archived terminal. Restore it.',
    )
    await t.rpc(k.finance.cookie, 'posTerminals/restore', { propertyId: k.vi.id, id: pool?.id })
    const history = await events(t, k.owner, { entityType: 'pos_terminal', entityId: pool?.id })
    expect(history.map((e) => e.action)).toEqual([
      'pos_terminal.restored',
      'pos_terminal.archived',
      'pos_terminal.created',
    ])
  })
})
