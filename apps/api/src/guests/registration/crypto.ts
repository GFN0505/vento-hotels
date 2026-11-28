// ID, passport and visa numbers are encrypted before they reach the database (decision 0031):
// AES-256-GCM with a fresh IV each time, stored as `v1.<key id>.<iv>.<tag>.<ciphertext>` (base64url).
// The key is GUEST_DATA_KEY (32 bytes, base64); older keys stay readable from
// GUEST_DATA_PREVIOUS_KEYS (comma-separated) while rows are re-encrypted. Outside production a
// development key is derived when none is set, so local and test databases work without one;
// staging and production refuse to start without it (env.ts).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

type Key = { id: string; bytes: Buffer }

const keyIdOf = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex').slice(0, 8)

function parseKey(base64: string): Key {
  const bytes = Buffer.from(base64.trim(), 'base64')
  if (bytes.length !== 32) throw new Error('GUEST_DATA_KEY must be 32 bytes, base64')
  return { id: keyIdOf(bytes), bytes }
}

let keys: { current: Key; all: Map<string, Key> } | undefined

function load() {
  if (keys) return keys
  const given = process.env.GUEST_DATA_KEY
  const current = given
    ? parseKey(given)
    : (() => {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('GUEST_DATA_KEY is not set')
        }
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

// For tests: forget the loaded keys so a changed environment is read again.
export function resetKeysForTests() {
  keys = undefined
}
