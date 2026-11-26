// Taxes and charges, payment setup and FX rates (spec: docs/specs/stage-1-taxes-and-payment-methods.md).
// Every procedure needs the front_desk feature. Changes need `finance.setup` (FX rates: `fx.enter`);
// reading taxes comes with `rates.edit` or `rooms.setup` too, payment setup with `rooms.setup` or
// `fx.enter`. No input carries an organizationId: the API takes it from the session.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { calendarDateSchema } from '../dates.ts'
import { FX_CURRENCIES, fxCurrencySchema, fxRateValueSchema, fxSourceSchema } from '../fx.ts'
import { idSchema } from '../ids.ts'
import { amountSchema } from '../money.ts'
import { MAX_PAGE_SIZE, pageQuerySchema, pageSchema } from '../pagination.ts'
import {
  accountNameSchema,
  accountNumberSchema,
  bankAccountCurrencySchema,
  bankNameSchema,
  cashForeignCurrenciesSchema,
  paymentMethodSchema,
  terminalIdSchema,
} from '../payments.ts'
import {
  pricingSchema,
  ratePercentSchema,
  taxableCategorySchema,
  taxBaseSchema,
  taxBreakdownSchema,
  taxCategorySchema,
  taxKindSchema,
  taxRuleInForceSchema,
} from '../taxes.ts'

// `data.code` on errors from these procedures, so the web app can react; messages are fit to show.
export const FINANCE_ERROR_CODES = [
  'FEATURE_OFF',
  'PROPERTY_NOT_FOUND',
  'PROPERTY_ARCHIVED',
  'TAXES_NOT_SET_UP',
  'TAXES_ALREADY_SET_UP',
  'NO_STATE',
  'START_TOO_EARLY',
  'RATE_ALREADY_SCHEDULED',
  'NOT_SCHEDULED',
  'GROUP_ACCESS_NEEDED', // VAT, a state tax or a company's account outside the member's hotels
  'SERVICE_CHARGE_EXISTS',
  'TAX_NAME_TAKEN',
  'REASON_REQUIRED',
  'STALE_VERSION',
  'LAST_METHOD',
  'NOT_YET_AVAILABLE',
  'BANK_ACCOUNT_TAKEN',
  'ACCOUNT_IN_USE',
  'TRANSFER_ACCOUNT_NGN',
  'TERMINAL_ID_TAKEN',
  'TERMINAL_ID_ARCHIVED',
  'SETTLEMENT_ACCOUNT',
  'FX_FUTURE_DATE',
  'FX_RATE_CHECK', // data.checks: { currency, message }[]
  'FX_RATE_EXISTS', // data.existing: { currency, rate, enteredByName, at }[]
  'SOURCE_REQUIRED',
] as const

const reason = z.string().trim().min(3, 'Give a reason of at least 3 characters').max(500)
const source = z.string().trim().min(3, 'Name the act, law or decision, and the section').max(300)
const categories = z
  .array(taxableCategorySchema)
  .min(1, 'Pick at least one kind of charge.')
  .transform((list) => [...new Set(list)])
const paidTo = z.string().trim().max(80, 'Keep it under 80 characters')
const taxName = z
  .string()
  .trim()
  .min(2, 'Name the tax')
  .max(80, 'Keep the name under 80 characters')
const hotel = { propertyId: idSchema }

// --- Taxes and charges ----------------------------------------------------------------------------

export const taxRateViewSchema = z.object({
  id: idSchema,
  // Null for a stop.
  ratePercent: z.string().nullable(),
  stop: z.boolean(),
  categories: z.array(taxableCategorySchema),
  base: taxBaseSchema,
  effectiveFrom: calendarDateSchema,
  // The day before the next version starts; null when none follows.
  effectiveTo: calendarDateSchema.nullable(),
  // The oldest version shows "until …".
  first: z.boolean(),
  source: z.string(),
  reason: z.string().nullable(),
  setByName: z.string(),
  setAt: z.iso.datetime(),
  verifiedByName: z.string().nullable(),
  verifiedOn: calendarDateSchema.nullable(),
  // Against the selected hotel's business date.
  status: z.enum(['scheduled', 'current', 'past', 'stopped']),
  // Current or scheduled, with no verification yet.
  toVerify: z.boolean(),
})
export type TaxRateView = z.infer<typeof taxRateViewSchema>

export const taxViewSchema = z.object({
  id: idSchema,
  kind: taxKindSchema,
  name: z.string(),
  paidTo: z.string().nullable(),
  stateCode: z.string().nullable(),
  version: z.number().int(),
  // "Every hotel in the group", "Kora Victoria Island and Kora Ikeja GRA", "Kora Victoria Island only".
  scope: z.string(),
  // Whether this member may change it; when not, why ("VAT applies to every hotel…").
  canChange: z.boolean(),
  readOnlyReason: z.string().nullable(),
  // The first start date a change may have: after the business date of every hotel it covers.
  earliestStart: calendarDateSchema,
  // The hotel with the latest business date, when the tax covers more than one.
  latestHotel: z.string().nullable(),
  // VAT at a hotel whose company isn't VAT registered: "Not charged at …".
  notCharged: z.string().nullable(),
  rates: z.array(taxRateViewSchema),
})
export type TaxView = z.infer<typeof taxViewSchema>

export const taxSetupSchema = z.object({
  property: z.object({
    id: idSchema,
    name: z.string(),
    stateCode: z.string().nullable(),
    // "Lagos", "FCT"; null when the hotel has no state yet.
    stateName: z.string().nullable(),
    businessDate: calendarDateSchema,
    // For showing moments (when a change was set) in the hotel's own time.
    timeZone: z.string(),
    live: z.boolean(),
    archived: z.boolean(),
    entityName: z.string(),
  }),
  setUp: z.boolean(),
  // What "Set up for …" would add now.
  plan: z.object({
    vat: z.boolean(),
    stateTax: z.string().nullable(),
    serviceCharge: z.boolean(),
    // No template for this state: "No consumption tax on file for Rivers."
    noStateTemplate: z.boolean(),
  }),
  canEdit: z.boolean(),
  taxes: z.array(taxViewSchema),
})
export type TaxSetup = z.infer<typeof taxSetupSchema>

const startsOn = calendarDateSchema
const rateChange = z.discriminatedUnion('stop', [
  z.object({ stop: z.literal(true) }),
  z.object({
    stop: z.literal(false),
    ratePercent: ratePercentSchema,
    categories,
    base: taxBaseSchema.default('net'),
  }),
])

export const scheduleTaxRateSchema = z
  .object({ ...hotel, taxId: idSchema, version: z.number().int().min(1), startsOn, source, reason })
  .and(rateChange)

export const createTaxSchema = z.object({
  ...hotel,
  kind: z.enum(['state_tax', 'service_charge']),
  name: taxName,
  paidTo: paidTo.optional(),
  ratePercent: ratePercentSchema,
  categories,
  base: taxBaseSchema.default('net'),
  startsOn,
  source,
  reason,
})

export const updateTaxSchema = z.object({
  ...hotel,
  id: idSchema,
  version: z.number().int().min(1),
  name: taxName,
  paidTo: paidTo.nullable(),
  reason: reason.optional(),
})

export const taxRulesInForceSchema = z.object({
  propertyId: idSchema,
  date: calendarDateSchema,
  rules: z.array(taxRuleInForceSchema),
})
export type TaxRulesInForce = z.infer<typeof taxRulesInForceSchema>

export const quoteTaxesSchema = z.object({
  ...hotel,
  // Defaults to the hotel's business date.
  date: calendarDateSchema.optional(),
  category: taxCategorySchema,
  amount: amountSchema,
  pricing: pricingSchema,
})

// --- Payments -------------------------------------------------------------------------------------

export const bankAccountViewSchema = z.object({
  id: idSchema,
  entityId: idSchema,
  entityName: z.string(),
  bankName: z.string(),
  // In full only for people who may change it; otherwise "••••4471".
  accountNumber: z.string(),
  last4: z.string(),
  accountName: z.string(),
  currency: bankAccountCurrencySchema,
  status: z.enum(['active', 'archived']),
  version: z.number().int(),
  // Hotels whose guests pay transfers into it.
  guestTransferFor: z.array(z.object({ id: idSchema, name: z.string() })),
  // Other hotels of the company ("Also used by Kora Ikeja GRA").
  alsoUsedBy: z.array(z.string()),
  activeTerminals: z.number().int(),
  canEdit: z.boolean(),
})
export type BankAccountView = z.infer<typeof bankAccountViewSchema>

export const paymentMethodViewSchema = z.object({
  method: paymentMethodSchema,
  enabled: z.boolean(),
  // NGN first, then foreign cash or the bank accounts' currencies.
  currencies: z.array(z.string()),
  foreignCurrencies: z.array(fxCurrencySchema),
  // Amber notes: "No account for guest transfers", "No USD rate yet. Enter today's FX rates."
  // `fix` says where it's put right, so the page can link there.
  warnings: z.array(
    z.object({ text: z.string(), fix: z.enum(['fx_rates', 'bank_accounts']).nullable() }),
  ),
})
export type PaymentMethodView = z.infer<typeof paymentMethodViewSchema>

export const paymentSetupSchema = z.object({
  property: z.object({
    id: idSchema,
    name: z.string(),
    entityId: idSchema,
    entityName: z.string(),
    live: z.boolean(),
    archived: z.boolean(),
    businessDate: calendarDateSchema,
  }),
  canEdit: z.boolean(),
  // Bank accounts belong to the company: only when every active hotel it owns is in access.
  canEditAccounts: z.boolean(),
  methods: z.array(paymentMethodViewSchema),
  guestTransferAccount: bankAccountViewSchema.nullable(),
})
export type PaymentSetup = z.infer<typeof paymentSetupSchema>

export const setPaymentMethodSchema = z.object({
  ...hotel,
  method: paymentMethodSchema,
  enabled: z.boolean(),
  foreignCurrencies: cashForeignCurrenciesSchema.optional(),
})

const statusFilter = z.enum(['active', 'archived']).default('active')
const listPage = pageQuerySchema.extend({
  ...hotel,
  status: statusFilter,
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(MAX_PAGE_SIZE),
})

const bankAccountFields = {
  bankName: bankNameSchema,
  accountNumber: accountNumberSchema,
  accountName: accountNameSchema,
  currency: bankAccountCurrencySchema,
  // "Guests at <hotel> pay transfers into this account".
  guestTransfer: z.boolean().default(false),
  // Required while a hotel the company owns is live.
  reason: reason.optional(),
}
export const createBankAccountSchema = z.object({ ...hotel, ...bankAccountFields })
export const updateBankAccountSchema = z.object({
  ...hotel,
  ...bankAccountFields,
  id: idSchema,
  version: z.number().int().min(1),
})
export const recordChangeSchema = z.object({ ...hotel, id: idSchema, reason: reason.optional() })

export const posTerminalViewSchema = z.object({
  id: idSchema,
  propertyId: idSchema,
  provider: z.string(),
  name: z.string(),
  terminalId: z.string(),
  bankAccountId: idSchema,
  // "Zenith Bank ••••4471"
  settlesInto: z.string(),
  status: z.enum(['active', 'archived']),
  version: z.number().int(),
})
export type PosTerminalView = z.infer<typeof posTerminalViewSchema>

const terminalFields = {
  provider: z.string().trim().min(2, 'Name the provider').max(60),
  name: z.string().trim().min(1, 'Name it the way staff do, e.g. Desk 1').max(60),
  terminalId: terminalIdSchema,
  bankAccountId: idSchema,
  reason: reason.optional(),
}
export const createPosTerminalSchema = z.object({ ...hotel, ...terminalFields })
export const updatePosTerminalSchema = z.object({
  ...hotel,
  ...terminalFields,
  id: idSchema,
  version: z.number().int().min(1),
})

// --- FX rates -------------------------------------------------------------------------------------

const fxEntry = z.object({
  rateDate: calendarDateSchema,
  rate: z.string(),
  enteredByName: z.string(),
  at: z.iso.datetime(),
})

export const fxSummarySchema = z.object({
  // Today in Lagos: the default rate date, and the latest one allowed.
  today: calendarDateSchema,
  canEnter: z.boolean(),
  currencies: z.array(
    z.object({
      currency: fxCurrencySchema,
      latest: fxEntry.nullable(),
      // The 30 days to today, oldest first, for the line.
      recent: z.array(z.object({ rateDate: calendarDateSchema, rate: z.string() })),
    }),
  ),
})
export type FxSummary = z.infer<typeof fxSummarySchema>

export const fxRateViewSchema = z.object({
  id: idSchema,
  currency: fxCurrencySchema,
  rateDate: calendarDateSchema,
  rate: z.string(),
  source: fxSourceSchema,
  enteredByName: z.string(),
  at: z.iso.datetime(),
  superseded: z.boolean(),
  replaceReason: z.string().nullable(),
})
export type FxRateView = z.infer<typeof fxRateViewSchema>

export const enterFxRatesSchema = z.object({
  rateDate: calendarDateSchema,
  rates: z
    .array(z.object({ currency: fxCurrencySchema, rate: fxRateValueSchema }))
    .min(1, 'Enter at least one rate')
    .max(FX_CURRENCIES.length)
    .refine(
      (list) => new Set(list.map((entry) => entry.currency)).size === list.length,
      'One rate per currency',
    ),
  // "Save anyway" after the typo check: the exact rates the person confirmed. A confirmation only
  // covers a rate sent with the same value; anything else is checked again.
  confirmed: z
    .array(z.object({ currency: fxCurrencySchema, rate: fxRateValueSchema }))
    .max(FX_CURRENCIES.length)
    .default([]),
  // Replacing a rate already entered for the date.
  replaceReason: reason.optional(),
})

export const fxRateForSchema = z
  .object({
    currency: fxCurrencySchema,
    rate: z.string(),
    source: fxSourceSchema,
    date: calendarDateSchema,
    // Days between the rate date and the hotel's business date.
    ageDays: z.number().int(),
  })
  .nullable()

export const financeContract = {
  taxes: {
    get: oc.input(z.object(hotel)).output(taxSetupSchema),
    setUp: oc.input(z.object(hotel)).output(taxSetupSchema),
    create: oc.input(createTaxSchema).output(taxSetupSchema),
    update: oc.input(updateTaxSchema).output(taxSetupSchema),
    schedule: oc.input(scheduleTaxRateSchema).output(taxSetupSchema),
    cancel: oc
      .input(z.object({ ...hotel, rateId: idSchema, version: z.number().int().min(1), reason }))
      .output(taxSetupSchema),
    verify: oc.input(z.object({ ...hotel, rateId: idSchema, source })).output(taxSetupSchema),
    inForce: oc
      .input(z.object({ ...hotel, date: calendarDateSchema.optional() }))
      .output(taxRulesInForceSchema),
    quote: oc.input(quoteTaxesSchema).output(taxBreakdownSchema),
  },
  paymentMethods: {
    get: oc.input(z.object(hotel)).output(paymentSetupSchema),
    set: oc.input(setPaymentMethodSchema).output(paymentSetupSchema),
  },
  bankAccounts: {
    list: oc.input(listPage).output(pageSchema(bankAccountViewSchema)),
    create: oc.input(createBankAccountSchema).output(bankAccountViewSchema),
    update: oc.input(updateBankAccountSchema).output(bankAccountViewSchema),
    archive: oc.input(recordChangeSchema).output(bankAccountViewSchema),
    restore: oc.input(recordChangeSchema).output(bankAccountViewSchema),
  },
  posTerminals: {
    list: oc.input(listPage).output(pageSchema(posTerminalViewSchema)),
    create: oc.input(createPosTerminalSchema).output(posTerminalViewSchema),
    update: oc.input(updatePosTerminalSchema).output(posTerminalViewSchema),
    archive: oc.input(recordChangeSchema).output(posTerminalViewSchema),
    restore: oc.input(recordChangeSchema).output(posTerminalViewSchema),
  },
  fxRates: {
    summary: oc.output(fxSummarySchema),
    list: oc
      .input(pageQuerySchema.extend({ currency: fxCurrencySchema.optional() }))
      .output(pageSchema(fxRateViewSchema)),
    enter: oc.input(enterFxRatesSchema).output(z.object({ saved: z.number().int() })),
    forHotel: oc.input(z.object({ ...hotel, currency: fxCurrencySchema })).output(fxRateForSchema),
  },
}
