// Taxes and charges, payment setup and FX rates (spec: stage-1-taxes-and-payment-methods.md).
// Statutory values are data here, never constants in code (decision 0005): each tax has dated rate
// versions that are never edited in place (a trigger in the migration refuses it), and Vento's
// templates are reference rows copied in only by "Set up for …".
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { archivedAt, calendarDate, id, timestamps } from '../columns.ts'
import { members, organizations } from './auth.ts'
import { entities, properties } from './tenancy.ts'

export const taxKindEnum = pgEnum('tax_kind', ['vat', 'state_tax', 'service_charge'])
export const taxBaseEnum = pgEnum('tax_base', ['net', 'net_plus_service_charge'])
export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'bank_transfer',
  'pos_terminal',
  'city_ledger',
  'card_online',
])
export const fxRateSourceEnum = pgEnum('fx_rate_source', ['cbn', 'market'])

const organizationId = () =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'restrict' })
const member = () => uuid().references(() => members.id, { onDelete: 'set null' })
const inOrganization = (
  name: string,
  columns: [AnyPgColumn, AnyPgColumn],
  target: [AnyPgColumn, AnyPgColumn],
) => foreignKey({ name, columns, foreignColumns: target }).onDelete('restrict')

// Fixed vocabulary from @vento/shared TAX_CATEGORIES (exempt never gets a rate).
const CATEGORY_LIST = sql`array['accommodation','food','beverage','events','laundry','other']::text[]`
const percent = () => numeric({ precision: 7, scale: 4, mode: 'string' })

// A tax or charge. VAT: one per group. A state tax: one state of the group (a state may have more
// than one, e.g. a levy). A service charge: one hotel, at most one per hotel.
export const taxes = pgTable(
  'taxes',
  {
    id: id(),
    organizationId: organizationId(),
    kind: taxKindEnum().notNull(),
    name: text().notNull(),
    // Who it is paid to ("NRS", "Lagos State IRS"); null for a service charge, kept by the hotel.
    paidTo: text(),
    stateCode: char({ length: 2 }),
    propertyId: uuid(),
    // Bumped by every change to the tax or its rates; a save names the version it started from.
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.propertyId),
    unique('taxes_organization_id_id_unique').on(t.organizationId, t.id),
    inOrganization(
      'taxes_property_fk',
      [t.organizationId, t.propertyId],
      [properties.organizationId, properties.id],
    ),
    check(
      'taxes_scope',
      sql`(${t.kind} = 'vat' and ${t.stateCode} is null and ${t.propertyId} is null)
        or (${t.kind} = 'state_tax' and ${t.stateCode} is not null and ${t.propertyId} is null)
        or (${t.kind} = 'service_charge' and ${t.stateCode} is null and ${t.propertyId} is not null)`,
    ),
    check('taxes_state_code_format', sql`${t.stateCode} is null or ${t.stateCode} ~ '^[A-Z]{2}$'`),
    check('taxes_name_length', sql`char_length(${t.name}) between 1 and 80`),
    uniqueIndex('taxes_one_vat_per_group').on(t.organizationId).where(sql`${t.kind} = 'vat'`),
    uniqueIndex('taxes_one_service_charge_per_hotel')
      .on(t.propertyId)
      .where(sql`${t.kind} = 'service_charge'`),
    uniqueIndex('taxes_state_tax_name_unique')
      .on(t.organizationId, t.stateCode, sql`lower(${t.name})`)
      .where(sql`${t.kind} = 'state_tax'`),
  ],
)

// A dated version of a tax: a rate (or a stop) from a business date on. Never edited in place: a
// change is a new version; only verification and cancelling a scheduled version are recorded on
// the row, and the migration's trigger refuses anything else, and every delete.
export const taxRates = pgTable(
  'tax_rates',
  {
    id: id(),
    organizationId: organizationId(),
    taxId: uuid().notNull(),
    // Null for a stop ("not charged from …").
    ratePercent: percent(),
    stop: boolean().notNull().default(false),
    categories: text().array().notNull().default(sql`'{}'::text[]`),
    base: taxBaseEnum().notNull().default('net'),
    effectiveFrom: calendarDate().notNull(),
    // Act, law or circular and section; for a service charge, the decision.
    source: text().notNull(),
    reason: text(),
    setByMemberId: member(),
    // "Kunle Ade", or "Vento default" for rates copied from a template.
    setByName: text().notNull(),
    verifiedByMemberId: member(),
    verifiedByName: text(),
    verifiedOn: calendarDate(),
    // The legal source recorded by whoever verified it (pre-filled with `source`).
    verifiedSource: text(),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledByName: text(),
    cancelReason: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.taxId, t.effectiveFrom),
    index().on(t.setByMemberId),
    index().on(t.verifiedByMemberId),
    inOrganization(
      'tax_rates_tax_fk',
      [t.organizationId, t.taxId],
      [taxes.organizationId, taxes.id],
    ),
    // One live version per tax per start date.
    uniqueIndex('tax_rates_one_per_start')
      .on(t.taxId, t.effectiveFrom)
      .where(sql`${t.cancelledAt} is null`),
    check(
      'tax_rates_rate_or_stop',
      sql`(${t.stop} and ${t.ratePercent} is null)
        or (not ${t.stop} and ${t.ratePercent} > 0 and ${t.ratePercent} <= 100
            and cardinality(${t.categories}) > 0)`,
    ),
    check('tax_rates_categories_known', sql`${t.categories} <@ ${CATEGORY_LIST}`),
    check(
      'tax_rates_verified_complete',
      sql`(${t.verifiedByName} is null) = (${t.verifiedOn} is null) and (${t.verifiedOn} is null) = (${t.verifiedSource} is null)`,
    ),
  ],
)

// Vento's starting rules, used only by "Set up for …" (no customer data, no organization). Seeded
// by migration; every value is illustrative and To verify once copied in.
export const taxTemplates = pgTable(
  'tax_templates',
  {
    id: id(),
    kind: taxKindEnum().notNull(),
    // For state taxes; null for VAT and service charge.
    stateCode: char({ length: 2 }),
    name: text().notNull(),
    paidTo: text(),
    ratePercent: percent().notNull(),
    categories: text().array().notNull(),
    base: taxBaseEnum().notNull().default('net'),
    // Null: from the hotel's current business date. VAT keeps its history ("since 1 Feb 2020").
    effectiveFrom: calendarDate(),
    source: text().notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.kind, t.stateCode),
    check('tax_templates_categories_known', sql`${t.categories} <@ ${CATEGORY_LIST}`),
  ],
)

// A company's bank account, shared by every hotel the company owns.
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: id(),
    organizationId: organizationId(),
    entityId: uuid().notNull(),
    bankName: text().notNull(),
    accountNumber: char({ length: 10 }).notNull(),
    accountName: text().notNull(),
    currency: char({ length: 3 }).notNull().default('NGN'),
    archivedAt: archivedAt(),
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.organizationId, t.entityId),
    unique('bank_accounts_organization_id_id_unique').on(t.organizationId, t.id),
    inOrganization(
      'bank_accounts_entity_fk',
      [t.organizationId, t.entityId],
      [entities.organizationId, entities.id],
    ),
    // Bank + account number are unique in the group, archived accounts included.
    uniqueIndex('bank_accounts_number_unique').on(
      t.organizationId,
      sql`lower(${t.bankName})`,
      t.accountNumber,
    ),
    check('bank_accounts_number_format', sql`${t.accountNumber} ~ '^[0-9]{10}$'`),
    check('bank_accounts_currency', sql`${t.currency} in ('NGN','USD','GBP','EUR')`),
  ],
)

// Each payment method's setting at a hotel. Rows are written on the first change; a hotel without
// one uses the method's default. The guest transfer account sits on the bank transfer row.
export const paymentMethodSettings = pgTable(
  'payment_method_settings',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    method: paymentMethodEnum().notNull(),
    enabled: boolean().notNull(),
    // Cash only: foreign currencies taken besides naira.
    foreignCurrencies: text().array().notNull().default(sql`'{}'::text[]`),
    guestTransferAccountId: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    unique('payment_method_settings_hotel_method_unique').on(t.propertyId, t.method),
    index().on(t.guestTransferAccountId),
    inOrganization(
      'payment_method_settings_property_fk',
      [t.organizationId, t.propertyId],
      [properties.organizationId, properties.id],
    ),
    inOrganization(
      'payment_method_settings_transfer_account_fk',
      [t.organizationId, t.guestTransferAccountId],
      [bankAccounts.organizationId, bankAccounts.id],
    ),
    check(
      'payment_method_settings_currencies',
      sql`${t.foreignCurrencies} <@ array['USD','GBP','EUR']::text[]
        and (${t.method} = 'cash' or cardinality(${t.foreignCurrencies}) = 0)`,
    ),
    check(
      'payment_method_settings_transfer_account',
      sql`${t.guestTransferAccountId} is null or ${t.method} = 'bank_transfer'`,
    ),
    check(
      'payment_method_settings_online_card_off',
      sql`${t.method} <> 'card_online' or not ${t.enabled}`,
    ),
  ],
)

// A card terminal registered to a hotel. From brick 10 a POS payment must name an active one.
export const posTerminals = pgTable(
  'pos_terminals',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    provider: text().notNull(),
    name: text().notNull(),
    terminalId: text().notNull(),
    bankAccountId: uuid().notNull(),
    archivedAt: archivedAt(),
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    index().on(t.organizationId, t.propertyId),
    index().on(t.bankAccountId),
    inOrganization(
      'pos_terminals_property_fk',
      [t.organizationId, t.propertyId],
      [properties.organizationId, properties.id],
    ),
    inOrganization(
      'pos_terminals_bank_account_fk',
      [t.organizationId, t.bankAccountId],
      [bankAccounts.organizationId, bankAccounts.id],
    ),
    // For the composite keys of the drawers it's at (cashier shifts).
    unique('pos_terminals_property_id_id_unique').on(t.propertyId, t.id),
    // Unique in the group, archived terminals included.
    uniqueIndex('pos_terminals_terminal_id_unique').on(t.organizationId, t.terminalId),
    check('pos_terminals_terminal_id_format', sql`${t.terminalId} ~ '^[A-Z0-9]{1,20}$'`),
  ],
)

// Naira per unit of a foreign currency for a rate date, group-wide. A replaced rate is kept,
// marked superseded; the migration's trigger refuses deletes and any other change.
export const fxRates = pgTable(
  'fx_rates',
  {
    id: id(),
    organizationId: organizationId(),
    currency: char({ length: 3 }).notNull(),
    rateDate: calendarDate().notNull(),
    rate: numeric({ precision: 14, scale: 4, mode: 'string' }).notNull(),
    source: fxRateSourceEnum().notNull().default('cbn'),
    enteredByMemberId: member(),
    enteredByName: text().notNull(),
    // On a replacement: why the earlier rate for the date was replaced.
    replaceReason: text(),
    supersededAt: timestamp({ withTimezone: true }),
    supersededById: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId, t.currency, t.rateDate),
    index().on(t.enteredByMemberId),
    uniqueIndex('fx_rates_one_per_date')
      .on(t.organizationId, t.currency, t.rateDate, t.source)
      .where(sql`${t.supersededAt} is null`),
    check('fx_rates_currency', sql`${t.currency} in ('USD','GBP','EUR')`),
    check('fx_rates_positive', sql`${t.rate} > 0`),
  ],
)
