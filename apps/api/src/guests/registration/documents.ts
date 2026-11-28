// ID photos and scans (decision 0031; spec "Verify ID step"). The device sends the file to the API
// (a camera photo already downscaled and re-encoded without metadata, or a scanned image or PDF);
// the API checks the real type from the bytes, strips JPEG metadata again, caps the size and writes
// it to the private bucket under a key of ids only. It stays pending until a check-in names it, then
// belongs to the guest. Viewing one needs guest.id_view and a reason, and gives a 60-second link.
import { createHash } from 'node:crypto'
import { ORPCError } from '@orpc/server'
import {
  ID_DOCUMENT_LINK_SECONDS,
  ID_DOCUMENT_MAX_BYTES,
  ID_DOCUMENT_TOO_LARGE,
  ID_DOCUMENT_WRONG_FILE,
  type IdDocument,
  type IdType,
  type uploadIdDocumentInputSchema,
  type viewIdDocumentInputSchema,
} from '@vento/shared'
import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm'
import type { z } from 'zod'
import { recordAudit } from '../../audit/record.ts'
import type { Database } from '../../db/client.ts'
import { guestIdDocuments, guestRegistrations } from '../../db/schema/front-desk.ts'
import { logger } from '../../observability/log.ts'
import type { StorageProvider } from '../../providers/storage.ts'
import { loadBookingHotel, type Reader, type Tx } from '../../reservations/context.ts'
import { noPermission } from '../../reservations/errors.ts'
import { inspectImage } from '../../storage/image.ts'
import { isPdf, stripJpegMetadata } from '../../storage/jpeg-strip.ts'
import { type Access, can, requireFeature, scopeToProperties } from '../../tenancy/access.ts'
import { CHECK_IN_ONLY } from './messages.ts'

type Deps = { db: Database; privateStorage?: StorageProvider | undefined }

export const ID_VIEW_ONLY = 'Only a GM or the owner can see ID photos. Ask your GM.'

const problem = (
  code: string,
  message: string,
  status: 'BAD_REQUEST' | 'CONFLICT' = 'BAD_REQUEST',
) => new ORPCError(status, { message, data: { code } })

export const documentNotFound = () =>
  new ORPCError('NOT_FOUND', {
    message: "The ID photo didn't upload. Take it again.",
    data: { code: 'ID_DOCUMENT_NOT_FOUND' },
  })

function requirePrivateStorage(deps: Deps): StorageProvider {
  if (!deps.privateStorage) {
    throw new ORPCError('PRECONDITION_FAILED', {
      message: "ID photos aren't set up on this server yet. Ask Vento.",
      data: { code: 'STORAGE_OFF' },
    })
  }
  return deps.privateStorage
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

// The file as it will be stored: its real type and, for a JPEG, without metadata.
export function checkIdFile(bytes: Uint8Array): { type: string; bytes: Uint8Array } {
  if (bytes.byteLength > ID_DOCUMENT_MAX_BYTES) {
    throw problem('ID_DOCUMENT_TOO_LARGE', ID_DOCUMENT_TOO_LARGE)
  }
  if (isPdf(bytes)) return { type: 'application/pdf', bytes }
  const image = inspectImage(bytes)
  if (!image) throw problem('ID_DOCUMENT_INVALID', ID_DOCUMENT_WRONG_FILE)
  if (image.type === 'image/jpeg') {
    const clean = stripJpegMetadata(bytes)
    if (!clean) throw problem('ID_DOCUMENT_INVALID', ID_DOCUMENT_WRONG_FILE)
    return { type: image.type, bytes: clean }
  }
  return { type: image.type, bytes }
}

const view = (row: typeof guestIdDocuments.$inferSelect): IdDocument => ({
  id: row.id,
  contentType: row.contentType,
  byteSize: row.byteSize,
  capturedAt: row.createdAt.toISOString(),
})

export async function uploadIdDocument(
  deps: Deps,
  access: Access,
  input: z.output<typeof uploadIdDocumentInputSchema>,
): Promise<IdDocument> {
  requireFeature(access, 'front_desk')
  if (!can(access, 'stay.check_in')) throw noPermission(CHECK_IN_ONLY)
  const storage = requirePrivateStorage(deps)
  const hotel = await loadBookingHotel(deps.db, access, input.propertyId)
  const raw = Buffer.from(input.data, 'base64')
  const checked = checkIdFile(raw)
  const sha256 = createHash('sha256').update(checked.bytes).digest('hex')
  // A resend (or an offline sync after a dropped answer) stores the file once.
  const [existing] = await deps.db
    .select()
    .from(guestIdDocuments)
    .where(
      and(
        eq(guestIdDocuments.organizationId, access.organizationId),
        eq(guestIdDocuments.id, input.documentId),
      ),
    )
  if (existing) {
    // Purged after a day unattached: the file is gone, so the resend can't name it.
    if (existing.purgedAt) throw documentNotFound()
    if (existing.sha256 !== sha256 || existing.propertyId !== hotel.id) {
      throw problem('IDEMPOTENCY_CONFLICT', 'This ID photo was already saved.', 'CONFLICT')
    }
    return view(existing)
  }
  // Ids only: no name, number or date in the key.
  const key = `guest-ids/${access.organizationId}/${hotel.id}/${input.documentId}.${EXTENSIONS[checked.type] ?? 'bin'}`
  await storage.put(key, checked.bytes, checked.type)
  const [row] = await deps.db
    .insert(guestIdDocuments)
    .values({
      id: input.documentId,
      organizationId: access.organizationId,
      propertyId: hotel.id,
      storageKey: key,
      contentType: checked.type,
      byteSize: checked.bytes.byteLength,
      sha256,
      source: input.source,
      byMemberId: access.memberId,
      byName: access.userName,
      deviceId: access.deviceId,
    })
    .onConflictDoNothing()
    .returning()
  if (row) return view(row)
  const [again] = await deps.db
    .select()
    .from(guestIdDocuments)
    .where(eq(guestIdDocuments.id, input.documentId))
  if (!again) throw documentNotFound()
  return view(again)
}

// A returning guest's latest ID document whose ID hasn't expired, or null.
export async function reusableDocument(
  db: Reader,
  access: Access,
  guestId: string,
  businessDate: string,
) {
  const [row] = await db
    .select()
    .from(guestIdDocuments)
    .where(
      and(
        eq(guestIdDocuments.organizationId, access.organizationId),
        eq(guestIdDocuments.guestId, guestId),
        eq(guestIdDocuments.status, 'attached'),
        isNull(guestIdDocuments.archivedAt),
        or(isNull(guestIdDocuments.idExpiry), gte(guestIdDocuments.idExpiry, businessDate)),
      ),
    )
    .orderBy(desc(guestIdDocuments.createdAt))
    .limit(1)
  return row ?? null
}

// Names a document for a guest inside a check-in (or "Add ID photo") transaction. A pending upload
// of this group becomes the guest's; a reused one must already be theirs.
export async function attachDocument(
  tx: Tx,
  access: Access,
  ask: {
    documentId: string
    guestId: string
    reuse: boolean
    idType: IdType | null
    idExpiry: string | null
    businessDate: string
  },
) {
  const [row] = await tx
    .select()
    .from(guestIdDocuments)
    .where(
      and(
        eq(guestIdDocuments.organizationId, access.organizationId),
        eq(guestIdDocuments.id, ask.documentId),
        isNull(guestIdDocuments.archivedAt),
        isNull(guestIdDocuments.purgedAt),
      ),
    )
    .for('update')
  if (!row) throw documentNotFound()
  if (ask.reuse) {
    const fresh = !row.idExpiry || row.idExpiry >= ask.businessDate
    if (row.status !== 'attached' || row.guestId !== ask.guestId || !fresh) throw documentNotFound()
    return { row, captured: false }
  }
  if (row.status === 'attached' && row.guestId === ask.guestId) return { row, captured: false }
  if (row.status !== 'pending') throw documentNotFound()
  const now = new Date()
  await tx
    .update(guestIdDocuments)
    .set({
      status: 'attached',
      guestId: ask.guestId,
      attachedAt: now,
      idType: ask.idType,
      idExpiry: ask.idExpiry,
      updatedAt: now,
    })
    .where(eq(guestIdDocuments.id, row.id))
  return { row, captured: true }
}

export async function viewIdDocument(
  deps: Deps,
  access: Access,
  input: z.output<typeof viewIdDocumentInputSchema>,
  resHeaders?: Headers,
) {
  requireFeature(access, 'front_desk')
  if (!can(access, 'guest.id_view')) throw noPermission(ID_VIEW_ONLY)
  const storage = requirePrivateStorage(deps)
  const [registration] = await deps.db
    .select({
      id: guestRegistrations.id,
      propertyId: guestRegistrations.propertyId,
      stayId: guestRegistrations.stayId,
      reservationId: guestRegistrations.reservationId,
      documentId: guestRegistrations.idDocumentId,
      businessDate: guestRegistrations.businessDate,
    })
    .from(guestRegistrations)
    .where(
      and(
        eq(guestRegistrations.organizationId, access.organizationId),
        eq(guestRegistrations.id, input.registrationId),
        scopeToProperties(access, guestRegistrations.propertyId),
      ),
    )
  if (!registration?.documentId) {
    throw new ORPCError('NOT_FOUND', { message: 'There is no ID photo on file for this guest.' })
  }
  const hotel = await loadBookingHotel(deps.db, access, registration.propertyId)
  const [document] = await deps.db
    .select()
    .from(guestIdDocuments)
    .where(eq(guestIdDocuments.id, registration.documentId))
  if (!document) throw documentNotFound()
  // Storage answers with the type the bytes were checked as (a JPEG or a PDF, never anything a
  // browser would run), shown inline: a PDF opens in its own tab, never framed in the app.
  const url = await storage.signedDownload(document.storageKey, ID_DOCUMENT_LINK_SECONDS, {
    contentType: document.contentType,
    disposition: 'inline',
  })
  await recordAudit(deps.db, access, {
    action: 'guest.id_document_viewed',
    entityType: 'reservation',
    entityId: registration.reservationId,
    propertyId: registration.propertyId,
    businessDate: hotel.businessDate,
    reason: input.reason,
    after: {
      registrationId: registration.id,
      stayId: registration.stayId,
      documentId: document.id,
      contentType: document.contentType,
    },
  })
  resHeaders?.set('cache-control', 'no-store')
  return {
    url,
    contentType: document.contentType,
    expiresInSeconds: ID_DOCUMENT_LINK_SECONDS,
  }
}

// Daily: uploads no check-in named within a day are deleted (the file; the row is marked purged and
// archived, so nothing can attach it after).
export async function purgePendingIdDocuments(
  db: Database,
  storage: StorageProvider,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const stale = await db
    .select({ id: guestIdDocuments.id, storageKey: guestIdDocuments.storageKey })
    .from(guestIdDocuments)
    .where(
      and(
        eq(guestIdDocuments.status, 'pending'),
        isNull(guestIdDocuments.purgedAt),
        lt(guestIdDocuments.createdAt, cutoff),
      ),
    )
    .orderBy(asc(guestIdDocuments.createdAt))
    .limit(500)
  if (!stale.length) return 0
  // Archived first, only while still pending: a check-in attaching one meanwhile keeps it (it
  // locks the row), and nothing can attach one whose file is being deleted.
  const purged = await db
    .update(guestIdDocuments)
    .set({ status: 'archived', purgedAt: now, archivedAt: now, updatedAt: now })
    .where(
      and(
        inArray(
          guestIdDocuments.id,
          stale.map((d) => d.id),
        ),
        eq(guestIdDocuments.status, 'pending'),
      ),
    )
    .returning({ storageKey: guestIdDocuments.storageKey })
  for (const document of purged) await storage.delete(document.storageKey)
  if (purged.length) logger.info({ count: purged.length }, 'Unattached ID photos deleted')
  return purged.length
}
