// Object storage behind an interface (decisions 0011, 0016): the S3 API only, so Cloudflare R2 in
// production and RustFS locally are interchangeable. Browsers upload straight to storage through a
// short-lived signed URL; the API only ever reads small files back to check them.
import { AwsClient } from 'aws4fetch'

export type SignedUpload = { url: string; headers: Record<string, string> }

export type StoredObject =
  | { status: 'found'; bytes: Uint8Array; size: number }
  | { status: 'missing' }
  | { status: 'too_large'; size: number }

export interface StorageProvider {
  // A PUT URL that accepts exactly this type and size, once (never over an existing file), for
  // `expiresInSeconds`.
  signedUpload(
    key: string,
    file: { contentType: string; size: number; expiresInSeconds: number },
  ): Promise<SignedUpload>
  // A GET URL for showing a file, for `expiresInSeconds`.
  signedDownload(key: string, expiresInSeconds: number): Promise<string>
  // The whole object, refusing anything larger than `maxBytes` without reading it.
  read(key: string, maxBytes: number): Promise<StoredObject>
  delete(key: string): Promise<void>
  // A server-side copy, so a checked file lives at a key no signed upload URL ever pointed at.
  copy(fromKey: string, toKey: string): Promise<'copied' | 'missing'>
  // Server-side writes (the demo seed's logo; later, generated PDFs).
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
}

export type S3Settings = {
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

// Storage calls never hang a request: a stalled connection fails after this long.
const STORAGE_TIMEOUT_MS = 15_000
const timeout = () => AbortSignal.timeout(STORAGE_TIMEOUT_MS)

export class S3StorageProvider implements StorageProvider {
  readonly #client: AwsClient
  readonly #base: string
  readonly #bucket: string

  constructor(settings: S3Settings) {
    this.#client = new AwsClient({
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      service: 's3',
      region: settings.region,
    })
    this.#bucket = encodeURIComponent(settings.bucket)
    // Path-style addressing works on R2 and RustFS alike.
    this.#base = `${settings.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(settings.bucket)}`
  }

  #url(key: string, expiresInSeconds?: number): string {
    const path = key.split('/').map(encodeURIComponent).join('/')
    return expiresInSeconds === undefined
      ? `${this.#base}/${path}`
      : `${this.#base}/${path}?X-Amz-Expires=${expiresInSeconds}`
  }

  async signedUpload(
    key: string,
    file: { contentType: string; size: number; expiresInSeconds: number },
  ): Promise<SignedUpload> {
    // Content type and length are signed, so storage refuses any other file under this URL, and
    // If-None-Match: * is signed, so a second PUT can't replace the first (R2 and RustFS answer 412).
    const headers = { 'content-type': file.contentType, 'if-none-match': '*' }
    const signed = await this.#client.sign(this.#url(key, file.expiresInSeconds), {
      method: 'PUT',
      headers: { ...headers, 'content-length': String(file.size) },
      aws: { signQuery: true, allHeaders: true },
    })
    // Browsers set Content-Length from the body themselves and refuse to have it set.
    return { url: signed.url, headers }
  }

  async signedDownload(key: string, expiresInSeconds: number): Promise<string> {
    const signed = await this.#client.sign(this.#url(key, expiresInSeconds), {
      method: 'GET',
      aws: { signQuery: true },
    })
    return signed.url
  }

  async read(key: string, maxBytes: number): Promise<StoredObject> {
    const response = await this.#client.fetch(this.#url(key), { method: 'GET', signal: timeout() })
    if (response.status === 404) {
      await response.body?.cancel()
      return { status: 'missing' }
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Storage answered ${response.status} reading an object`)
    }
    const size = Number(response.headers.get('content-length') ?? Number.NaN)
    if (Number.isFinite(size) && size > maxBytes) {
      await response.body?.cancel()
      return { status: 'too_large', size }
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) return { status: 'too_large', size: bytes.byteLength }
    return { status: 'found', bytes, size: bytes.byteLength }
  }

  async delete(key: string): Promise<void> {
    const response = await this.#client.fetch(this.#url(key), {
      method: 'DELETE',
      signal: timeout(),
    })
    await response.body?.cancel()
    if (!response.ok && response.status !== 404) {
      throw new Error(`Storage answered ${response.status} deleting an object`)
    }
  }

  async copy(fromKey: string, toKey: string): Promise<'copied' | 'missing'> {
    const source = `/${this.#bucket}/${fromKey.split('/').map(encodeURIComponent).join('/')}`
    const response = await this.#client.fetch(this.#url(toKey), {
      method: 'PUT',
      headers: { 'x-amz-copy-source': source },
      signal: timeout(),
    })
    await response.body?.cancel()
    if (response.status === 404) return 'missing'
    if (!response.ok) throw new Error(`Storage answered ${response.status} copying an object`)
    return 'copied'
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const response = await this.#client.fetch(this.#url(key), {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: bytes,
      signal: timeout(),
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error(`Storage answered ${response.status} writing an object`)
  }

  // Local development only: create the bucket if it's missing and let any localhost web app upload
  // to it. R2's bucket and CORS rules are set up with the servers (docs/ops/deploy.md).
  async prepareLocalBucket(options: { cors?: boolean } = {}): Promise<void> {
    const head = await this.#client.fetch(this.#base, { method: 'HEAD' })
    await head.body?.cancel()
    if (head.status === 404) {
      const created = await this.#client.fetch(this.#base, { method: 'PUT' })
      await created.body?.cancel()
      if (!created.ok) throw new Error(`Storage answered ${created.status} creating the bucket`)
    }
    // The private bucket (guest ID images) is never reached from a browser except by a signed GET.
    if (options.cors === false) return
    const cors =
      '<CORSConfiguration><CORSRule><AllowedOrigin>http://localhost:*</AllowedOrigin>' +
      '<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod>' +
      '<AllowedHeader>*</AllowedHeader><MaxAgeSeconds>600</MaxAgeSeconds></CORSRule></CORSConfiguration>'
    const md5 = await contentMd5(cors)
    const response = await this.#client.fetch(`${this.#base}?cors`, {
      method: 'PUT',
      headers: { 'content-type': 'application/xml', 'content-md5': md5 },
      body: cors,
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error(`Storage answered ${response.status} setting CORS`)
  }
}

// S3 requires Content-MD5 on bucket configuration writes.
async function contentMd5(text: string): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('md5').update(text).digest('base64')
}

// For tests: files live in memory. In tests `put` also stands in for the browser's upload.
export class MemoryStorageProvider implements StorageProvider {
  readonly files = new Map<string, Uint8Array>()

  async signedUpload(
    key: string,
    file: { contentType: string; size: number; expiresInSeconds: number },
  ): Promise<SignedUpload> {
    return {
      url: `memory://uploads/${key}?expires=${file.expiresInSeconds}`,
      headers: { 'content-type': file.contentType, 'if-none-match': '*' },
    }
  }

  async signedDownload(key: string, expiresInSeconds: number): Promise<string> {
    return `memory://files/${key}?expires=${expiresInSeconds}`
  }

  async read(key: string, maxBytes: number): Promise<StoredObject> {
    const bytes = this.files.get(key)
    if (!bytes) return { status: 'missing' }
    if (bytes.byteLength > maxBytes) return { status: 'too_large', size: bytes.byteLength }
    return { status: 'found', bytes, size: bytes.byteLength }
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key)
  }

  async copy(fromKey: string, toKey: string): Promise<'copied' | 'missing'> {
    const bytes = this.files.get(fromKey)
    if (!bytes) return 'missing'
    this.files.set(toKey, bytes)
    return 'copied'
  }

  async put(key: string, bytes: Uint8Array, _contentType?: string): Promise<void> {
    this.files.set(key, bytes)
  }
}
