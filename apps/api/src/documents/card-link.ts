// The registration card's link (spec: "Served as a short-lived signed URL (5 minutes), bound to the
// organization and hotel; not stored"). The token names the group, hotel, stay and copy, expires
// in 5 minutes and is signed with the server's secret; the PDF is rendered from the record when the
// link is opened.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const CARD_LINK_SECONDS = 5 * 60

export type CardClaims = {
  organizationId: string
  propertyId: string
  stayId: string
  copy: number
  // Who printed it, for the footer.
  byName: string
  deviceName: string | null
  expiresAt: number
}

const sign = (secret: string, body: string) =>
  createHmac('sha256', `registration-card:${secret}`).update(body).digest('base64url')

export function cardLink(secret: string, claims: Omit<CardClaims, 'expiresAt'>, now = Date.now()) {
  const body = Buffer.from(
    JSON.stringify({ ...claims, expiresAt: now + CARD_LINK_SECONDS * 1000 }),
  ).toString('base64url')
  return `/api/files/registration-card?t=${body}.${sign(secret, body)}`
}

export function readCardToken(secret: string, token: string, now = Date.now()): CardClaims | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = Buffer.from(sign(secret, body))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CardClaims
    return claims.expiresAt > now ? claims : null
  } catch {
    return null
  }
}
