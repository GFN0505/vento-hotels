// The demo's placeholder logo for Kora Victoria Island: a white K on deep green, 512 px square,
// stored like a confirmed upload so the owner sees a hotel with a logo and one without.
import { newId } from '@vento/shared'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { fileUploads, properties } from '../db/schema/tenancy.ts'
import type { StorageProvider } from '../providers/storage.ts'
import { pngFromPixels } from '../storage/png.ts'

const SIZE = 512
const GREEN: [number, number, number] = [14, 77, 61]
const WHITE: [number, number, number] = [255, 255, 255]

// Inside the K: a stem and two arms, in coordinates from 0 to 1.
function inK(x: number, y: number): boolean {
  if (y < 0.2 || y > 0.8) return false
  if (x >= 0.3 && x <= 0.42) return true
  if (x < 0.42 || x > 0.72) return false
  const arm = 0.5 - (x - 0.42) * (0.3 / 0.3)
  return Math.abs(y - arm) < 0.065 || Math.abs(y - (1 - arm)) < 0.065
}

export function koraLogo(): Uint8Array {
  return pngFromPixels(SIZE, SIZE, (x, y) => (inK(x / SIZE, y / SIZE) ? WHITE : GREEN))
}

export async function seedLogo(
  db: Database,
  storage: StorageProvider,
  hotel: { organizationId: string; propertyId: string; memberId: string },
): Promise<void> {
  const id = newId()
  const storageKey = `logos/${hotel.organizationId}/${hotel.propertyId}/${id}.png`
  const bytes = koraLogo()
  await storage.put(storageKey, bytes, 'image/png')
  await db.transaction(async (tx) => {
    await tx.insert(fileUploads).values({
      id,
      organizationId: hotel.organizationId,
      propertyId: hotel.propertyId,
      purpose: 'property_logo',
      storageKey,
      contentType: 'image/png',
      byteSize: bytes.length,
      status: 'confirmed',
      width: SIZE,
      height: SIZE,
      createdByMemberId: hotel.memberId,
      confirmedAt: new Date(),
    })
    await tx.update(properties).set({ logoUploadId: id }).where(eq(properties.id, hotel.propertyId))
  })
}
