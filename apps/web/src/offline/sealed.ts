// What a queued check-in carries that must not sit on the device in the clear (decision 0029): the
// typed ID and visa numbers and the ID photo. Sealed with AES-GCM under a key made on this device,
// kept in IndexedDB as a non-extractable CryptoKey (it can be used here, never read out), and
// deleted with the command once it is answered and dismissed.
import { getOutboxItem, setOutboxItem } from './store'

const KEY = 'seal-key'

async function key(): Promise<CryptoKey> {
  const saved = await getOutboxItem<CryptoKey>(KEY)
  if (saved) return saved
  const made = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await setOutboxItem(KEY, made)
  return made
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export async function seal(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = new TextEncoder().encode(JSON.stringify(value))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), body),
  )
  return `${toBase64(iv)}.${toBase64(sealed)}`
}

export async function unseal<T>(sealed: string): Promise<T> {
  const [iv = '', body = ''] = sealed.split('.')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    await key(),
    fromBase64(body),
  )
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
