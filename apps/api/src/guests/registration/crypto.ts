// ID, passport and visa numbers are encrypted before they reach the database (decision 0031):
// AES-256-GCM with a fresh IV each time, stored as `v1.<key id>.<iv>.<tag>.<ciphertext>` (base64url).
// The key is GUEST_DATA_KEY (32 bytes, base64); older keys stay readable from
// GUEST_DATA_PREVIOUS_KEYS (comma-separated) while rows are re-encrypted. A fixed development key
// is used only when asked for (ALLOW_DEV_GUEST_DATA_KEY=true, which the dev, seed, test and
// browser-test scripts set) on a local, non-production server; anywhere else a missing key stops
// the API at start (env.ts reads the same rule) and here.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

type Key = { id: string; bytes: Buffer }

const keyIdOf = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex').slice(0, 8)

function parseKey(base64: string): Key {
  const bytes = Buffer.from(base64.trim(), 'base64')
  if (bytes.length !== 32) throw new Error('GUEST_DATA_KEY must be 32 bytes, base64')
  return { id: keyIdOf(bytes), bytes }
}

// One rule for env.ts and for this module: the development key never where real guests can be.
export function devGuestKeyAllowed(source: Record<string, string | undefined>): boolean {
  return (
    source.ALLOW_DEV_GUEST_DATA_KEY === 'true' &&
    source.NODE_ENV !== 'production' &&
    (source.DEPLOY_ENV ?? 'local') === 'local'
  )
}

let keys: { current: Key; all: Map<string, Key> } | undefined

function load() {
  if (keys) return keys
  const given = process.env.GUEST_DATA_KEY
  const current = given
    ? parseKey(given)
    : (() => {
        if (!devGuestKeyAllowed(process.env)) throw new Error('GUEST_DATA_KEY is not set')
        // Development and tests only, never where real guests are: one fixed key, so the demo
        // seed, the dev API and the browser tests' API all read the same rows.
        const bytes = createHash('sha256').update('vento-development-guest-data').digest()
        return { id: keyIdOf(bytes), bytes }
      })()
  const previous = (process.env.GUEST_DATA_PREVIOUS_KEYS ?? '')
    .split(',')
    .filter((value) => value.trim())
    .map(parseKey)
  keys = { current, all: new Map([current, ...previous].map((key) => [key.id, key])) }
  return keys
}

export const currentKeyId = () => load().current.id

export function encryptId(plain: string): string {
  const { current } = load()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', current.bytes, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    'v1',
    current.id,
    iv.toString('base64url'),
    tag.toString('base64url'),
    body.toString('base64url'),
  ].join('.')
}

export function decryptId(stored: string): string {
  const [version, keyId, iv, tag, body] = stored.split('.')
  if (version !== 'v1' || !keyId || !iv || !tag || body === undefined) {
    throw new Error('Unreadable ID number')
  }
  const key = load().all.get(keyId)
  if (!key) throw new Error('The key for this ID number is not loaded')
  const decipher = createDecipheriv('aes-256-gcm', key.bytes, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

// A keyed fingerprint of a number, for telling two sends of the same check-in apart (the stored
// request hash): the full number counts, yet nothing in the database can be tried against a list of
// likely numbers without the key. A separate key derived from the current one, never used to encrypt.
export function idFingerprint(plain: string): string {
  const derived = createHash('sha256')
    .update('vento-id-fingerprint')
    .update(load().current.bytes)
    .digest()
  return createHmac('sha256', derived).update(plain).digest('base64url')
}

// For tests: forget the loaded keys so a changed environment is read again.
export function resetKeysForTests() {
  keys = undefined
}
