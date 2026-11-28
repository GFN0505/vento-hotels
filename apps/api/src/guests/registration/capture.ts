// Writes a stay's guest registrations inside the check-in (or walk-in) transaction (spec:
// "Registration step"): checks each against the rule set in force, copies a returning guest's
// encrypted number when kept, encrypts typed numbers (decision 0031), numbers the lead guest's card
// (lock step 7b, the card counter), names the ID photo, and records the audit events (masked
// numbers and field names only).
import { ORPCError } from '@orpc/server'
import {
  type IdDocumentChoice,
  type IdType,
  idNumberProblem,
  isForeign,
  MISSING_FIELD_MESSAGES,
  maskIdNumber,
  missingFields,
  normalizeIdNumber,
  type RegistrationField,
  type RegistrationValues,
  type RegistrationView,
  type RuleSet,
  registrationCardNumber,
  requiredFields,
} from '@vento/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AuditEvent } from '../../audit/record.ts'
import {
  guestIdDocuments,
  guestRegistrations,
  registrationCardCounters,
} from '../../db/schema/front-desk.ts'
import type { Reader, Tx } from '../../reservations/context.ts'
import { type Access, can } from '../../tenancy/access.ts'
import { currentKeyId, encryptId } from './crypto.ts'
import { attachDocument } from './documents.ts'
import { SKIP_ONLY } from './messages.ts'

export type RegistrationRow = typeof guestRegistrations.$inferSelect
type DocumentRow = typeof guestIdDocuments.$inferSelect

export const registrationIncomplete = (fields: RegistrationField[], guest: number) =>
  new ORPCError('BAD_REQUEST', {
    message: MISSING_FIELD_MESSAGES[fields[0] ?? 'name'],
    data: { code: 'REGISTRATION_INCOMPLETE', fields, guest },
  })

const badNumber = (message: string, guest: number, field: 'idNumber' | 'visaNumber') =>
  new ORPCError('BAD_REQUEST', {
    message,
    data: {
      code: 'REGISTRATION_INCOMPLETE',
      fields: [field === 'idNumber' ? 'id_number' : 'visa_number'],
      guest,
    },
  })

export function toRegistrationView(
  row: RegistrationRow,
  document?: Pick<DocumentRow, 'id' | 'contentType' | 'createdAt'> | null,
): RegistrationView {
  return {
    id: row.id,
    lead: row.lead,
    cardNumber: row.cardNumber,
    guestId: row.guestId,
    title: row.title,
    firstName: row.firstName,
    lastName: row.lastName,
    nationality: row.nationality,
    dateOfBirth: row.dateOfBirth,
    addressLine: row.addressLine,
    addressCity: row.addressCity,
    addressRegion: row.addressRegion,
    addressCountry: row.addressCountry,
    purpose: row.purpose,
    vehiclePlate: row.vehiclePlate,
    occupation: row.occupation,
    idType: row.idType,
    idNumberMasked: row.idNumberMasked,
    idCountry: row.idCountry,
    idExpiry: row.idExpiry,
    visaType: row.visaType,
    visaTypeText: row.visaTypeText,
    visaNumberMasked: row.visaNumberMasked,
    visaValidUntil: row.visaValidUntil,
    entryDate: row.entryDate,
    portOfEntry: row.portOfEntry,
    portOfEntryText: row.portOfEntryText,
    arrivingFrom: row.arrivingFrom,
    nextDestination: row.nextDestination,
    idDocument: document
      ? {
          id: document.id,
          contentType: document.contentType,
          capturedAt: document.createdAt.toISOString(),
        }
      : null,
    businessDate: row.businessDate,
    byName: row.byName,
    createdAt: row.createdAt.toISOString(),
  }
}

// The registrations of some stays with their documents, masked.
export async function registrationsOf(db: Reader, access: Access, stayIds: readonly string[]) {
  if (stayIds.length === 0) return []
  const rows = await db
    .select()
    .from(guestRegistrations)
    .where(
      and(
        eq(guestRegistrations.organizationId, access.organizationId),
        inArray(guestRegistrations.stayId, [...stayIds]),
      ),
    )
    .orderBy(sql`${guestRegistrations.lead} desc`, guestRegistrations.createdAt)
  const ids = rows.flatMap((row) => (row.idDocumentId ? [row.idDocumentId] : []))
  const documents = ids.length
    ? await db
        .select({
          id: guestIdDocuments.id,
          contentType: guestIdDocuments.contentType,
          createdAt: guestIdDocuments.createdAt,
        })
        .from(guestIdDocuments)
        .where(inArray(guestIdDocuments.id, ids))
    : []
  const byId = new Map(documents.map((d) => [d.id, d]))
  return rows.map((row) => ({
    row,
    view: toRegistrationView(row, row.idDocumentId ? byId.get(row.idDocumentId) : null),
  }))
}

async function nextCardNumber(
  tx: Tx,
  access: Access,
  hotel: { id: string; bookingPrefix: string; businessDate: string },
) {
  const year = hotel.businessDate.slice(0, 4)
  const [row] = await tx
    .insert(registrationCardCounters)
    .values({ organizationId: access.organizationId, propertyId: hotel.id, year, last: 1 })
    .onConflictDoUpdate({
      target: [registrationCardCounters.propertyId, registrationCardCounters.year],
      set: { last: sql`${registrationCardCounters.last} + 1`, updatedAt: new Date() },
    })
    .returning({ last: registrationCardCounters.last })
  return registrationCardNumber(hotel.bookingPrefix, year, row?.last ?? 1)
}

const FIELD_NAMES: (keyof RegistrationValues)[] = [
  'title',
  'dateOfBirth',
  'addressLine',
  'addressCity',
  'addressRegion',
  'addressCountry',
  'purpose',
  'vehiclePlate',
  'occupation',
  'idType',
  'idCountry',
  'idExpiry',
  'visaType',
  'visaTypeText',
  'visaValidUntil',
  'entryDate',
  'portOfEntry',
  'portOfEntryText',
  'arrivingFrom',
  'nextDestination',
]

export const givenFields = (values: Partial<RegistrationValues>) =>
  FIELD_NAMES.filter((name) => values[name] !== undefined && values[name] !== null)

// Checks one registration against the rules and returns what to store for its numbers.
export async function checkRegistration(
  db: Reader,
  access: Access,
  input: RegistrationValues,
  context: {
    index: number
    ruleSet: RuleSet
    leadGuestId: string | null
    hasContact: boolean
    hasDocument: boolean
  },
) {
  const values = { ...input }
  let reused: RegistrationRow | null = null
  if (values.reuseFrom && !values.idNumber && context.leadGuestId) {
    const [earlier] = await db
      .select()
      .from(guestRegistrations)
      .where(
        and(
          eq(guestRegistrations.organizationId, access.organizationId),
          eq(guestRegistrations.id, values.reuseFrom),
          eq(guestRegistrations.guestId, context.leadGuestId),
        ),
      )
    reused = earlier ?? null
  }
  const required = requiredFields(context.ruleSet, {
    nationality: values.nationality,
    lead: values.lead,
  }).filter((field) => field !== 'id_document' && field !== 'contact')
  const missing = missingFields(values, required, {
    hasContact: context.hasContact,
    hasIdNumber: Boolean(reused?.idNumberCipher),
    hasDocument: context.hasDocument,
  })
  if (missing.length) throw registrationIncomplete(missing, context.index)
  const idType = (values.idType ?? reused?.idType ?? null) as IdType | null
  let id: { cipher: string; masked: string } | null = null
  if (values.idNumber) {
    const problem = idNumberProblem(idType ?? undefined, values.idNumber)
    if (problem) throw badNumber(problem, context.index, 'idNumber')
    const number = normalizeIdNumber(values.idNumber)
    id = { cipher: encryptId(number), masked: maskIdNumber(idType ?? 'passport', number) }
  } else if (reused?.idNumberCipher && reused.idNumberMasked) {
    id = { cipher: reused.idNumberCipher, masked: reused.idNumberMasked }
  }
  let visa: { cipher: string; masked: string } | null = null
  if (values.visaNumber && values.visaType !== 'not_required') {
    const problem = idNumberProblem('passport', values.visaNumber)
    if (problem) throw badNumber(problem, context.index, 'visaNumber')
    const number = normalizeIdNumber(values.visaNumber)
    visa = { cipher: encryptId(number), masked: maskIdNumber('visa', number) }
  } else if (reused?.visaNumberCipher && reused.visaNumberMasked && !values.visaType) {
    visa = { cipher: reused.visaNumberCipher, masked: reused.visaNumberMasked }
  }
  return { values, idType, id, visa, reused }
}

export type Captured = {
  views: RegistrationView[]
  rows: RegistrationRow[]
  events: AuditEvent[]
  idPhotoMissing: boolean
  documentId: string | null
}

export async function captureRegistrations(
  tx: Tx,
  access: Access,
  context: {
    hotel: { id: string; bookingPrefix: string; businessDate: string }
    stay: { id: string; reservationId: string; reservationNumber: string }
    guest: { id: string; phone: string | null; email: string | null }
    ruleSet: RuleSet
    source: 'desk' | 'walk_in' | 'offline'
    idDocument: IdDocumentChoice
  },
  inputs: RegistrationValues[],
): Promise<Captured> {
  const lead = inputs[0]
  if (!lead) throw registrationIncomplete(['name'], 0)
  const photoRequired = requiredFields(context.ruleSet, {
    nationality: lead.nationality,
    lead: true,
  }).includes('id_document')
  const choice = context.idDocument
  if (choice.kind === 'skip' && !can(access, 'guest.id_skip')) {
    throw new ORPCError('FORBIDDEN', {
      message: SKIP_ONLY,
      data: { code: 'SKIP_ID_DOCUMENT_NOT_ALLOWED' },
    })
  }
  if (choice.kind === 'none' && photoRequired) {
    throw new ORPCError('BAD_REQUEST', {
      message: MISSING_FIELD_MESSAGES.id_document,
      data: { code: 'ID_DOCUMENT_REQUIRED', fields: ['id_document'], guest: 0 },
    })
  }
  const checked = []
  for (const [index, input] of inputs.entries()) {
    checked.push(
      await checkRegistration(tx, access, input, {
        index,
        ruleSet: context.ruleSet,
        leadGuestId: index === 0 ? context.guest.id : null,
        hasContact: index === 0 ? Boolean(context.guest.phone || context.guest.email) : true,
        hasDocument: choice.kind === 'uploaded' || choice.kind === 'reuse',
      }),
    )
  }
  // Step 7b: the card counter.
  const cardNumber = await nextCardNumber(tx, access, context.hotel)
  const leadChecked = checked[0]
  let documentId: string | null = null
  const events: AuditEvent[] = []
  const at = {
    entityType: 'reservation',
    entityId: context.stay.reservationId,
    propertyId: context.hotel.id,
    businessDate: context.hotel.businessDate,
  }
  if ((choice.kind === 'uploaded' || choice.kind === 'reuse') && leadChecked) {
    const attached = await attachDocument(tx, access, {
      documentId: choice.documentId,
      guestId: context.guest.id,
      reuse: choice.kind === 'reuse',
      idType: leadChecked.idType,
      idExpiry: leadChecked.values.idExpiry ?? null,
      businessDate: context.hotel.businessDate,
    })
    documentId = attached.row.id
    events.push({
      action: 'guest.id_document_captured',
      ...at,
      after: {
        documentId,
        stayId: context.stay.id,
        reservationNumber: context.stay.reservationNumber,
        contentType: attached.row.contentType,
        byteSize: attached.row.byteSize,
        source: attached.row.source,
        reused: !attached.captured,
      },
    })
  }
  if (choice.kind === 'skip') {
    events.push({
      action: 'guest.id_document_skipped',
      ...at,
      reason: choice.reason,
      after: { stayId: context.stay.id, reservationNumber: context.stay.reservationNumber },
    })
  }
  const rows = await tx
    .insert(guestRegistrations)
    .values(
      checked.map((item, index) => {
        const v = item.values
        return {
          organizationId: access.organizationId,
          propertyId: context.hotel.id,
          stayId: context.stay.id,
          reservationId: context.stay.reservationId,
          guestId: index === 0 ? context.guest.id : null,
          lead: index === 0,
          cardNumber: index === 0 ? cardNumber : null,
          title: v.title ?? null,
          firstName: v.firstName,
          lastName: v.lastName,
          nationality: v.nationality,
          phone: index === 0 ? context.guest.phone : null,
          email: index === 0 ? context.guest.email : null,
          dateOfBirth: v.dateOfBirth ?? null,
          addressLine: v.addressLine ?? null,
          addressCity: v.addressCity ?? null,
          addressRegion: v.addressRegion ?? null,
          addressCountry: v.addressCountry ?? null,
          purpose: v.purpose ?? null,
          vehiclePlate: v.vehiclePlate ?? null,
          occupation: v.occupation ?? null,
          idType: item.idType,
          idNumberCipher: item.id?.cipher ?? null,
          idNumberMasked: item.id?.masked ?? null,
          idCountry:
            v.idCountry ??
            (item.idType === 'passport' && isForeign(v.nationality) ? v.nationality : null),
          idExpiry: v.idExpiry ?? null,
          visaType: v.visaType ?? null,
          visaTypeText: v.visaTypeText ?? null,
          visaNumberCipher: item.visa?.cipher ?? null,
          visaNumberMasked: item.visa?.masked ?? null,
          visaValidUntil: v.visaType === 'not_required' ? null : (v.visaValidUntil ?? null),
          entryDate: v.entryDate ?? null,
          portOfEntry: v.portOfEntry ?? null,
          portOfEntryText: v.portOfEntryText ?? null,
          arrivingFrom: v.arrivingFrom ?? null,
          nextDestination: v.nextDestination ?? null,
          keyId: item.id || item.visa ? currentKeyId() : null,
          idDocumentId: index === 0 ? documentId : null,
          idDocumentRequired: index === 0 && photoRequired,
          ruleSetVersion: context.ruleSet.version,
          reusedFromId: item.reused?.id ?? null,
          source: context.source,
          businessDate: context.hotel.businessDate,
          byMemberId: access.memberId,
          byName: access.userName,
          deviceId: access.deviceId,
        }
      }),
    )
    .returning()
  for (const row of rows) {
    const item = checked[rows.indexOf(row)]
    events.push({
      action: 'guest.registration_captured',
      ...at,
      after: {
        registrationId: row.id,
        stayId: context.stay.id,
        cardNumber: row.cardNumber,
        guestId: row.guestId,
        lead: row.lead,
        nationality: row.nationality,
        foreign: isForeign(row.nationality),
        idType: row.idType,
        idNumberMasked: row.idNumberMasked,
        visaNumberMasked: row.visaNumberMasked,
        fields: item ? givenFields(item.values) : [],
        reusedFrom: row.reusedFromId,
        ruleSetVersion: row.ruleSetVersion,
        idDocumentId: row.idDocumentId,
      },
    })
  }
  const documents = documentId
    ? await tx
        .select({
          id: guestIdDocuments.id,
          contentType: guestIdDocuments.contentType,
          createdAt: guestIdDocuments.createdAt,
        })
        .from(guestIdDocuments)
        .where(eq(guestIdDocuments.id, documentId))
    : []
  return {
    rows,
    views: rows.map((row) => toRegistrationView(row, row.lead ? documents[0] : null)),
    events,
    idPhotoMissing: photoRequired && documentId === null,
    documentId,
  }
}
