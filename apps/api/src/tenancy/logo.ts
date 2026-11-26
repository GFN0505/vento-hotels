// A hotel's logo: the first upload in the product (decision 0016). The browser sends the file
// straight to object storage through a short-lived signed URL bound to its type and size; the API
// then reads it back and checks what it really is before the hotel uses it. Every upload has its
// own key and old files are kept, so documents already issued keep the logo they showed.
import {
  LOGO_MAX_BYTES,
  LOGO_MIN_PIXELS,
  type LogoUpload,
  newId,
  type Property,
} from '@vento/shared'
import { and, asc, eq, lt } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { fileUploads, properties } from '../db/schema/tenancy.ts'
import { logger } from '../observability/log.ts'
import type { StorageProvider } from '../providers/storage.ts'
import { inspectImage } from '../storage/image.ts'
import { type Access, propertyScope, requirePermission } from './access.ts'
import { hotelIsArchived, hotelNotFound, logoProblem, SETUP_ONLY, storageOff } from './errors.ts'
import { lockProperty } from './properties.ts'
import { type HotelDeps, readProperty, type Tx } from './property-views.ts'

const UPLOAD_SECONDS = 5 * 60
const PURPOSE = 'property_logo'
const WRONG_FILE = 'Use a PNG or JPEG up to 2 MB.'
const NOT_UPLOADED = "The logo didn't upload. Try again."

function requireStorage(deps: HotelDeps): StorageProvider {
  if (!deps.storage) throw storageOff()
  return deps.storage
}

async function activeHotel(db: Pick<Database, 'select'>, access: Access, id: string) {
  const [property] = await db
    .select({ id: properties.id, name: properties.name, archivedAt: properties.archivedAt })
    .from(properties)
    .where(and(eq(properties.id, id), propertyScope(access)))
  if (!property) throw hotelNotFound()
  if (property.archivedAt) throw hotelIsArchived(property.name)
  return property
}

export async function logoUploadUrl(
  deps: HotelDeps,
  access: Access,
  input: { propertyId: string; contentType: 'image/png' | 'image/jpeg'; size: number },
): Promise<LogoUpload> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  const storage = requireStorage(deps)
  const property = await activeHotel(deps.db, access, input.propertyId)
  const id = newId()
  const extension = input.contentType === 'image/png' ? 'png' : 'jpg'
  // The key names the group and hotel, so a file can never be confused with another group's.
  const storageKey = `logos/${access.organizationId}/${property.id}/${id}.${extension}`
  await deps.db.insert(fileUploads).values({
    id,
    organizationId: access.organizationId,
    propertyId: property.id,
    purpose: PURPOSE,
    storageKey,
    contentType: input.contentType,
    byteSize: input.size,
    createdByMemberId: access.memberId,
  })
  const signed = await storage.signedUpload(storageKey, {
    contentType: input.contentType,
    size: input.size,
    expiresInSeconds: UPLOAD_SECONDS,
  })
  return {
    uploadId: id,
    url: signed.url,
    method: 'PUT',
    headers: signed.headers,
    expiresAt: new Date(Date.now() + UPLOAD_SECONDS * 1000).toISOString(),
  }
}

type Upload = typeof fileUploads.$inferSelect

// This group's upload for this hotel, or NOT_FOUND: a key from elsewhere is never used.
async function findUpload(db: Pick<Database, 'select'>, access: Access, input: SetLogoInput) {
  const [upload] = await db
    .select()
    .from(fileUploads)
    .where(
      and(
        eq(fileUploads.id, input.uploadId),
        eq(fileUploads.organizationId, access.organizationId),
        eq(fileUploads.propertyId, input.propertyId),
        eq(fileUploads.purpose, PURPOSE),
      ),
    )
  if (!upload) throw logoProblem('LOGO_NOT_UPLOADED', NOT_UPLOADED)
  return upload
}

type Checked = { contentType: string; width: number; height: number }

// Reads the stored file and checks its real type, size and dimensions. A file that fails is
// deleted and its upload marked rejected; the hotel keeps its old logo.
async function checkStoredFile(
  db: Database,
  storage: StorageProvider,
  upload: Upload,
): Promise<Checked> {
  const stored = await storage.read(upload.storageKey, LOGO_MAX_BYTES)
  if (stored.status === 'missing') throw logoProblem('LOGO_NOT_UPLOADED', NOT_UPLOADED)
  const image = stored.status === 'found' ? inspectImage(stored.bytes) : null
  const reject = async (code: 'LOGO_INVALID' | 'LOGO_TOO_SMALL', message: string) => {
    await storage.delete(upload.storageKey)
    await db.update(fileUploads).set({ status: 'rejected' }).where(eq(fileUploads.id, upload.id))
    return logoProblem(code, message)
  }
  if (!image) throw await reject('LOGO_INVALID', WRONG_FILE)
  if (Math.min(image.width, image.height) < LOGO_MIN_PIXELS) {
    const side = image.width <= image.height ? `${image.width} px wide` : `${image.height} px tall`
    throw await reject(
      'LOGO_TOO_SMALL',
      `This logo is ${side}. Use one at least ${LOGO_MIN_PIXELS} px on each side.`,
    )
  }
  return { contentType: image.type, width: image.width, height: image.height }
}

type SetLogoInput = { propertyId: string; uploadId: string }

// Confirms a new upload, or brings back a logo this hotel used before (Undo after Remove).
export async function setLogo(
  deps: HotelDeps,
  access: Access,
  input: SetLogoInput,
): Promise<Property> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  const storage = requireStorage(deps)
  await activeHotel(deps.db, access, input.propertyId)
  const upload = await findUpload(deps.db, access, input)
  if (upload.status === 'rejected' || upload.status === 'expired') {
    throw logoProblem('LOGO_NOT_UPLOADED', NOT_UPLOADED)
  }
  // Checked before the transaction: reading storage mustn't hold the hotel's row lock.
  const checked =
    upload.status === 'pending' ? await checkStoredFile(deps.db, storage, upload) : null

  return deps.db.transaction(async (tx) => {
    const property = await lockProperty(tx, access, input.propertyId)
    if (property.archivedAt) throw hotelIsArchived(property.name)
    const [current] = await tx
      .select({ logoUploadId: properties.logoUploadId })
      .from(properties)
      .where(eq(properties.id, property.id))
    if (current?.logoUploadId !== upload.id) {
      if (checked) {
        await tx
          .update(fileUploads)
          .set({ status: 'confirmed', confirmedAt: new Date(), ...checked })
          .where(and(eq(fileUploads.id, upload.id), eq(fileUploads.status, 'pending')))
      }
      await tx
        .update(properties)
        .set({ logoUploadId: upload.id })
        .where(eq(properties.id, property.id))
      await recordAudit(tx, access, {
        action: 'property.logo_changed',
        entityType: 'property',
        entityId: property.id,
        propertyId: property.id,
        businessDate: property.businessDate,
        before: { logoUploadId: current?.logoUploadId ?? null },
        after: {
          logoUploadId: upload.id,
          contentType: checked?.contentType ?? upload.contentType,
          width: checked?.width ?? upload.width,
          height: checked?.height ?? upload.height,
          liveProperty: property.liveSince !== null,
        },
      })
    }
    return read(tx, deps, access, property.id)
  })
}

// The file stays in storage: documents already issued may show it, and Undo brings it back.
export async function removeLogo(
  deps: HotelDeps,
  access: Access,
  input: { propertyId: string },
): Promise<Property> {
  requirePermission(access, 'setup.manage', SETUP_ONLY)
  return deps.db.transaction(async (tx) => {
    const property = await lockProperty(tx, access, input.propertyId)
    if (property.archivedAt) throw hotelIsArchived(property.name)
    const [current] = await tx
      .select({ logoUploadId: properties.logoUploadId })
      .from(properties)
      .where(eq(properties.id, property.id))
    if (current?.logoUploadId) {
      await tx.update(properties).set({ logoUploadId: null }).where(eq(properties.id, property.id))
      await recordAudit(tx, access, {
        action: 'property.logo_removed',
        entityType: 'property',
        entityId: property.id,
        propertyId: property.id,
        businessDate: property.businessDate,
        before: { logoUploadId: current.logoUploadId },
        after: { logoUploadId: null, liveProperty: property.liveSince !== null },
      })
    }
    return read(tx, deps, access, property.id)
  })
}

async function read(tx: Tx, deps: HotelDeps, access: Access, id: string): Promise<Property> {
  const property = await readProperty({ db: tx, storage: deps.storage }, access, id)
  if (!property) throw hotelNotFound()
  return property
}

// Daily job: uploads given a signed URL but never confirmed are deleted after a day.
export async function purgeUnconfirmedUploads(
  db: Database,
  storage: StorageProvider,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const stale = await db
    .select({ id: fileUploads.id, storageKey: fileUploads.storageKey })
    .from(fileUploads)
    .where(and(eq(fileUploads.status, 'pending'), lt(fileUploads.createdAt, cutoff)))
    .orderBy(asc(fileUploads.createdAt))
    .limit(500)
  for (const upload of stale) {
    await storage.delete(upload.storageKey)
    await db
      .update(fileUploads)
      .set({ status: 'expired' })
      .where(and(eq(fileUploads.id, upload.id), eq(fileUploads.status, 'pending')))
  }
  if (stale.length > 0) logger.info({ count: stale.length }, 'Unconfirmed uploads deleted')
  return stale.length
}
