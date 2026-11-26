// Payment methods per hotel: a fixed list, each on or off, with foreign cash on Cash and the guest
// transfer account on Bank transfer. Configuration only; no money is taken here. Rows are written
// on the first change; until then each method has its default.
import { ORPCError } from '@orpc/server'
import {
  FX_CURRENCIES,
  type FxCurrency,
  PAYMENT_METHOD_INFO,
  PAYMENT_METHODS,
  type PaymentMethod,
  type PaymentSetup,
} from '@vento/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { bankAccounts, paymentMethodSettings } from '../db/schema/finance.ts'
import { type Access, can } from '../tenancy/access.ts'
import { bankAccountViews, companyRule } from './bank-accounts.ts'
import {
  dateLabel,
  type Hotel,
  loadHotel,
  lockKey,
  type Reader,
  requireFinanceSetup,
  requirePaymentsRead,
  type Tx,
} from './context.ts'
import { fxRateFor } from './fx-rates.ts'

export type MethodSetting = {
  enabled: boolean
  foreignCurrencies: FxCurrency[]
  guestTransferAccountId: string | null
}

export async function methodSettings(
  db: Reader,
  hotelId: string,
): Promise<Record<PaymentMethod, MethodSetting>> {
  const rows = await db
    .select()
    .from(paymentMethodSettings)
    .where(eq(paymentMethodSettings.propertyId, hotelId))
  return Object.fromEntries(
    PAYMENT_METHODS.map((method) => {
      const row = rows.find((r) => r.method === method)
      return [
        method,
        row
          ? {
              enabled: row.enabled,
              foreignCurrencies: FX_CURRENCIES.filter((c) => row.foreignCurrencies.includes(c)),
              guestTransferAccountId: row.guestTransferAccountId,
            }
          : {
              enabled: PAYMENT_METHOD_INFO[method].defaultOn,
              foreignCurrencies: [],
              guestTransferAccountId: null,
            },
      ]
    }),
  ) as Record<PaymentMethod, MethodSetting>
}

// Writes one method's setting, keeping what isn't given.
export async function saveMethod(
  tx: Tx,
  access: Access,
  hotelId: string,
  method: PaymentMethod,
  setting: MethodSetting,
) {
  await tx
    .insert(paymentMethodSettings)
    .values({ organizationId: access.organizationId, propertyId: hotelId, method, ...setting })
    .onConflictDoUpdate({
      target: [paymentMethodSettings.propertyId, paymentMethodSettings.method],
      set: { ...setting },
    })
}

async function companyCurrencies(db: Reader, access: Access, entityId: string) {
  const rows = await db
    .select({ currency: bankAccounts.currency })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.organizationId, access.organizationId),
        eq(bankAccounts.entityId, entityId),
        isNull(bankAccounts.archivedAt),
      ),
    )
  const order = ['NGN', ...FX_CURRENCIES] as string[]
  const list = [...new Set(rows.map((row) => row.currency))].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  )
  return list.length > 0 ? list : ['NGN']
}

export async function paymentSetupFor(
  db: Reader,
  access: Access,
  hotel: Hotel,
): Promise<PaymentSetup> {
  const [settings, transferCurrencies, rule] = await Promise.all([
    methodSettings(db, hotel.id),
    companyCurrencies(db, access, hotel.entityId),
    companyRule(db, access, hotel.entityId),
  ])
  const transferId = settings.bank_transfer.guestTransferAccountId
  const [transfer] = transferId ? await bankAccountViews(db, access, hotel, [transferId]) : []
  const cashWarnings = await Promise.all(
    settings.cash.foreignCurrencies.map(async (currency) => {
      const rate = await fxRateFor(db, access.organizationId, currency, hotel.businessDate)
      if (!rate) return `No ${currency} rate yet. Enter today's FX rates.`
      if (rate.ageDays > 1) {
        return `Latest ${currency} rate is from ${dateLabel(rate.date)}. Enter today's FX rates.`
      }
      return null
    }),
  )
  const methods = PAYMENT_METHODS.map((method) => {
    const setting = settings[method]
    const warnings: string[] = []
    if (method === 'cash' && setting.enabled) {
      warnings.push(...cashWarnings.filter((w): w is string => w !== null))
    }
    if (method === 'bank_transfer' && setting.enabled && !transfer) {
      warnings.push('No account for guest transfers')
    }
    const currencies =
      method === 'cash'
        ? ['NGN', ...setting.foreignCurrencies]
        : method === 'bank_transfer'
          ? transferCurrencies
          : ['NGN']
    return {
      method,
      enabled: setting.enabled,
      currencies,
      foreignCurrencies: setting.foreignCurrencies,
      warnings,
    }
  })
  return {
    property: {
      id: hotel.id,
      name: hotel.name,
      entityId: hotel.entityId,
      entityName: hotel.entityName,
      live: hotel.live,
      archived: hotel.archived,
      businessDate: hotel.businessDate,
    },
    canEdit: can(access, 'finance.setup') && !hotel.archived,
    canEditAccounts: can(access, 'finance.setup') && rule.canEdit,
    methods,
    guestTransferAccount: transfer ?? null,
  }
}

export async function getPaymentSetup(db: Reader, access: Access, propertyId: string) {
  requirePaymentsRead(access)
  return paymentSetupFor(db, access, await loadHotel(db, access, propertyId))
}

// Switching a method on or off (reversible at once with Undo), or choosing Cash's foreign
// currencies. At least one method stays on; Online card waits for online payments. Audited only.
export async function setPaymentMethod(
  db: Database,
  access: Access,
  input: {
    propertyId: string
    method: PaymentMethod
    enabled: boolean
    foreignCurrencies?: FxCurrency[] | undefined
  },
): Promise<PaymentSetup> {
  requireFinanceSetup(access)
  return db.transaction(async (tx) => {
    const hotel = await loadHotel(tx, access, input.propertyId, { hold: true })
    await lockKey(tx, `payment-methods:${hotel.id}`)
    const info = PAYMENT_METHOD_INFO[input.method]
    if (input.enabled && info.comingLater) {
      throw new ORPCError('CONFLICT', {
        message: `${info.label} ${info.comingLater.toLowerCase()}.`,
        data: { code: 'NOT_YET_AVAILABLE' },
      })
    }
    const settings = await methodSettings(tx, hotel.id)
    const before = settings[input.method]
    const after: MethodSetting = {
      ...before,
      enabled: input.enabled,
      foreignCurrencies:
        input.method === 'cash' ? (input.foreignCurrencies ?? before.foreignCurrencies) : [],
    }
    const othersOn = PAYMENT_METHODS.some((m) => m !== input.method && settings[m].enabled)
    if (!after.enabled && !othersOn) {
      throw new ORPCError('CONFLICT', {
        message: 'Keep at least one payment method on.',
        data: { code: 'LAST_METHOD' },
      })
    }
    const unchanged =
      before.enabled === after.enabled &&
      before.foreignCurrencies.join() === after.foreignCurrencies.join()
    if (!unchanged) {
      await saveMethod(tx, access, hotel.id, input.method, after)
      await recordAudit(tx, access, {
        action: 'payment_method.changed',
        entityType: 'property',
        entityId: hotel.id,
        propertyId: hotel.id,
        businessDate: hotel.businessDate,
        before: {
          method: input.method,
          enabled: before.enabled,
          foreignCurrencies: before.foreignCurrencies,
        },
        after: {
          method: input.method,
          enabled: after.enabled,
          foreignCurrencies: after.foreignCurrencies,
          liveProperty: hotel.live,
        },
      })
    }
    return paymentSetupFor(tx, access, hotel)
  })
}
