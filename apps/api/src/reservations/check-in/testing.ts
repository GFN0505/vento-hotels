// Test helpers for check-in, walk-in and registrations: drive the procedures as the check-in sheet
// and the walk-in page do. Every number is made up, in a valid shape.
import type { CheckedIn, IdDocument } from '@vento/shared'
import { newId } from '@vento/shared'
import { pngFromPixels } from '../../storage/png.ts'
import type { createTestApp } from '../../test/harness.ts'
import { type Result, rpc } from '../change/testing.ts'

type TestApp = ReturnType<typeof createTestApp>

export const NIN = '12345678901'
export const PASSPORT = 'A01234567'

export const nigerian = (extra: Record<string, unknown> = {}) => ({
  lead: true,
  firstName: 'Sarah',
  lastName: 'Collins',
  nationality: 'NG',
  addressLine: '12 Allen Avenue',
  addressCity: 'Ikeja',
  addressRegion: 'Lagos',
  addressCountry: 'NG',
  idType: 'nin',
  idNumber: NIN,
  ...extra,
})

export const british = (extra: Record<string, unknown> = {}) => ({
  lead: true,
  firstName: 'Sarah',
  lastName: 'Collins',
  nationality: 'GB',
  addressLine: '14 Clarendon Road',
  addressCity: 'London',
  addressCountry: 'GB',
  idType: 'passport',
  idNumber: PASSPORT,
  idCountry: 'GB',
  idExpiry: '2031-03-14',
  occupation: 'Engineer',
  visaType: 'business',
  visaNumber: 'V3307001',
  visaValidUntil: '2027-02-01',
  arrivingFrom: 'London',
  nextDestination: 'Abuja',
  ...extra,
})

// A small real PNG: an ID card's shape in grey.
export const idPhoto = () =>
  Buffer.from(
    pngFromPixels(64, 40, (x, y) =>
      y < 8 ? [14, 77, 61] : x < 20 ? [200, 200, 200] : [240, 240, 240],
    ),
  ).toString('base64')

export async function upload(
  t: TestApp,
  cookie: string,
  propertyId: string,
  data = idPhoto(),
  contentType = 'image/png',
) {
  return rpc<IdDocument>(t, cookie, 'registrations/uploadIdDocument', {
    documentId: newId(),
    propertyId,
    contentType,
    data,
  })
}

export async function checkIn(
  t: TestApp,
  cookie: string,
  stay: { id: string; version: number },
  roomId: string,
  extra: Record<string, unknown> & { businessDate: string },
): Promise<Result<CheckedIn>> {
  return rpc<CheckedIn>(t, cookie, 'checkIn/checkIn', {
    idempotencyKey: newId(),
    stayId: stay.id,
    version: stay.version,
    roomId,
    registrations: [british()],
    idDocument: { kind: 'skip', reason: 'Camera not working' },
    printCard: false,
    occurredAt: new Date().toISOString(),
    durationSeconds: 40,
    ...extra,
  })
}
