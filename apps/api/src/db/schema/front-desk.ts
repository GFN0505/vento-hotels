// Check-in and registration (spec: docs/specs/stage-1-front-desk-check-in.md). Guest registrations
// (one per registered guest per stay, ID and visa numbers encrypted: decision 0031), the
// registration rule set (Vento's statutory starting rules, To verify, and each group's overrides),
// the registration card counter, ID photos and scans (files in the private bucket), and the rooms
// an in-house stay used before a move (decision 0030).
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { archivedAt, calendarDate, id, timestamps } from '../columns.ts'
import { members, organizations } from './auth.ts'
import { guests, reservations, stays } from './reservations.ts'
import { rooms, roomTypes } from './rooms.ts'
import { devices, properties } from './tenancy.ts'

export const idTypeEnum = pgEnum('id_type', [
  'nin',
  'passport',
  'drivers_licence',
  'voters_card',
  'ecowas_id',
])
export const visaTypeEnum = pgEnum('visa_type', [
  'visa_on_arrival',
  'business',
  'tourist',
  'transit',
  'residence_permit',
  'other',
  'not_required',
])
export const portOfEntryEnum = pgEnum('port_of_entry', [
  'lagos_mmia',
  'abuja_naia',
  'port_harcourt_phia',
  'kano_makia',
  'enugu',
  'seme',
  'other',
])
export const visitPurposeEnum = pgEnum('visit_purpose', ['business', 'leisure', 'other'])
export const registrationSourceEnum = pgEnum('registration_source', [
  'desk',
  'walk_in',
  'offline',
  'import',
])
export const ruleAudienceEnum = pgEnum('registration_rule_audience', ['all', 'foreign', 'ecowas'])
export const idDocumentStatusEnum = pgEnum('id_document_status', [
  'pending',
  'attached',
  'archived',
])
export const idDocumentSourceEnum = pgEnum('id_document_source', ['camera', 'upload', 'offline'])

const organizationId = () =>
  uuid()
    .notNull()
    .references(() => organizations.id, { onDelete: 'restrict' })
const inProperty = (name: string, t: { organizationId: AnyPgColumn; propertyId: AnyPgColumn }) =>
  foreignKey({
    name,
    columns: [t.organizationId, t.propertyId],
    foreignColumns: [properties.organizationId, properties.id],
  }).onDelete('restrict')
const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' })

// Vento's starting registration rules: no organization, seeded by migration, every row To verify
// (spec question 1; nigeria-compliance). `scope` is 'federal' or a state code.
export const registrationRuleTemplates = pgTable(
  'registration_rule_templates',
  {
    id: id(),
    scope: text().notNull().default('federal'),
    audience: ruleAudienceEnum().notNull(),
    field: text().notNull(),
    required: boolean().notNull(),
    effectiveFrom: calendarDate().notNull(),
    effectiveTo: calendarDate(),
    source: text().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('registration_rule_templates_unique').on(t.scope, t.audience, t.field, t.effectiveFrom),
  ],
)

// A group's overrides of the starting rules, for a state or one hotel, with effective dates and
// who verified them against the law.
export const registrationRules = pgTable(
  'registration_rules',
  {
    id: id(),
    organizationId: organizationId(),
    // Null: every hotel of the group in `scope`.
    propertyId: uuid(),
    scope: text().notNull().default('federal'),
    audience: ruleAudienceEnum().notNull(),
    field: text().notNull(),
    required: boolean().notNull(),
    effectiveFrom: calendarDate().notNull(),
    effectiveTo: calendarDate(),
    source: text().notNull(),
    verifiedAt: timestamptz(),
    verifiedBy: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.organizationId),
    foreignKey({
      name: 'registration_rules_property_fk',
      columns: [t.organizationId, t.propertyId],
      foreignColumns: [properties.organizationId, properties.id],
    }).onDelete('restrict'),
  ],
)

// The next registration card number per hotel per year (RC-VI-26-000147).
export const registrationCardCounters = pgTable(
  'registration_card_counters',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    year: char({ length: 4 }).notNull(),
    last: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    inProperty('registration_card_counters_property_fk', t),
    unique('registration_card_counters_property_year_unique').on(t.propertyId, t.year),
    index().on(t.organizationId),
  ],
)

// An ID photo or scan (decision 0031). The file is in the private bucket under `storageKey`, made of
// ids only. Uploaded first (pending), then named by a check-in (attached, with the guest). Never
// hard-deleted while a registration points at it; pending ones not attached within a day go.
export const guestIdDocuments = pgTable(
  'guest_id_documents',
  {
    id: id(),
    organizationId: organizationId(),
    // Where it was captured.
    propertyId: uuid().notNull(),
    guestId: uuid(),
    storageKey: text().notNull().unique(),
    contentType: text().notNull(),
    byteSize: integer().notNull(),
    sha256: text().notNull(),
    status: idDocumentStatusEnum().notNull().default('pending'),
    source: idDocumentSourceEnum().notNull(),
    // The ID it shows, once attached (for reuse: a document whose ID hasn't expired).
    idType: idTypeEnum(),
    idExpiry: calendarDate(),
    byMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    byName: text().notNull(),
    deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    attachedAt: timestamptz(),
    archivedAt: archivedAt(),
    purgedAt: timestamptz(),
    ...timestamps,
  },
  (t) => [
    inProperty('guest_id_documents_property_fk', t),
    foreignKey({
      name: 'guest_id_documents_guest_fk',
      columns: [t.organizationId, t.guestId],
      foreignColumns: [guests.organizationId, guests.id],
    }).onDelete('restrict'),
    unique('guest_id_documents_organization_id_id_unique').on(t.organizationId, t.id),
    index().on(t.organizationId, t.guestId, t.createdAt),
    index().on(t.status, t.createdAt),
    check('guest_id_documents_size', sql`${t.byteSize} > 0 and ${t.byteSize} <= 5242880`),
    check(
      'guest_id_documents_attached',
      sql`${t.status} = 'pending' or (${t.guestId} is not null and ${t.attachedAt} is not null)`,
    ),
  ],
)

// One per registered guest per stay: the lead guest and each further adult. ID and visa numbers are
// ciphertext (AES-256-GCM, `keyId` names the key) with a masked form beside them; there is no plain
// number column anywhere.
export const guestRegistrations = pgTable(
  'guest_registrations',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    stayId: uuid().notNull(),
    reservationId: uuid().notNull(),
    // The lead guest's profile; null for an adult registered by name only.
    guestId: uuid(),
    lead: boolean().notNull(),
    // RC-VI-26-000147 for the lead guest's card; null for other adults.
    cardNumber: text(),
    title: text(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    nationality: char({ length: 2 }).notNull(),
    // Snapshots of the profile's contact at check-in (the card prints them).
    phone: text(),
    email: text(),
    dateOfBirth: calendarDate(),
    addressLine: text(),
    addressCity: text(),
    addressRegion: text(),
    addressCountry: char({ length: 2 }),
    purpose: visitPurposeEnum(),
    vehiclePlate: text(),
    occupation: text(),
    idType: idTypeEnum(),
    idNumberCipher: text(),
    idNumberMasked: text(),
    idCountry: char({ length: 2 }),
    idExpiry: calendarDate(),
    visaType: visaTypeEnum(),
    visaTypeText: text(),
    visaNumberCipher: text(),
    visaNumberMasked: text(),
    visaValidUntil: calendarDate(),
    entryDate: calendarDate(),
    portOfEntry: portOfEntryEnum(),
    portOfEntryText: text(),
    arrivingFrom: text(),
    nextDestination: text(),
    keyId: text(),
    idDocumentId: uuid(),
    // The rule set asked for an ID photo when this was captured: without one, the stay shows
    // "ID photo to add" until a photo is attached.
    idDocumentRequired: boolean().notNull().default(false),
    // The rule set's version the record was checked against.
    ruleSetVersion: text().notNull(),
    reusedFromId: uuid(),
    source: registrationSourceEnum().notNull(),
    signature: text().notNull().default('paper'),
    businessDate: calendarDate().notNull(),
    byMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    byName: text().notNull(),
    deviceId: uuid().references(() => devices.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    inProperty('guest_registrations_property_fk', t),
    foreignKey({
      name: 'guest_registrations_stay_fk',
      columns: [t.propertyId, t.stayId],
      foreignColumns: [stays.propertyId, stays.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'guest_registrations_reservation_fk',
      columns: [t.propertyId, t.reservationId],
      foreignColumns: [reservations.propertyId, reservations.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'guest_registrations_guest_fk',
      columns: [t.organizationId, t.guestId],
      foreignColumns: [guests.organizationId, guests.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'guest_registrations_document_fk',
      columns: [t.organizationId, t.idDocumentId],
      foreignColumns: [guestIdDocuments.organizationId, guestIdDocuments.id],
    }).onDelete('restrict'),
    unique('guest_registrations_property_card_unique').on(t.propertyId, t.cardNumber),
    index().on(t.organizationId, t.guestId, t.createdAt),
    index().on(t.organizationId, t.propertyId, t.businessDate),
    index().on(t.stayId),
    index().on(t.idDocumentId),
    check('guest_registrations_card', sql`(${t.lead}) = (${t.cardNumber} is not null)`),
    check(
      'guest_registrations_id_number',
      sql`(${t.idNumberCipher} is null) = (${t.idNumberMasked} is null) and (${t.visaNumberCipher} is null) = (${t.visaNumberMasked} is null)`,
    ),
    check(
      'guest_registrations_names',
      sql`char_length(${t.firstName}) between 1 and 60 and char_length(${t.lastName}) between 1 and 60`,
    ),
  ],
)

// The nights an in-house stay spent in a room before a move (decision 0030). Written only for
// nights before the business date, which nothing can assign again.
export const stayRoomSegments = pgTable(
  'stay_room_segments',
  {
    id: id(),
    organizationId: organizationId(),
    propertyId: uuid().notNull(),
    stayId: uuid().notNull(),
    roomId: uuid().notNull(),
    roomTypeId: uuid().notNull(),
    fromDate: calendarDate().notNull(),
    toDate: calendarDate().notNull(),
    ...timestamps,
  },
  (t) => [
    inProperty('stay_room_segments_property_fk', t),
    foreignKey({
      name: 'stay_room_segments_stay_fk',
      columns: [t.propertyId, t.stayId],
      foreignColumns: [stays.propertyId, stays.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'stay_room_segments_room_fk',
      columns: [t.propertyId, t.roomId],
      foreignColumns: [rooms.propertyId, rooms.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'stay_room_segments_room_type_fk',
      columns: [t.propertyId, t.roomTypeId],
      foreignColumns: [roomTypes.propertyId, roomTypes.id],
    }).onDelete('restrict'),
    index().on(t.stayId),
    index().on(t.roomId),
    index().on(t.organizationId, t.propertyId, t.fromDate),
    check('stay_room_segments_dates', sql`${t.toDate} > ${t.fromDate}`),
  ],
)
