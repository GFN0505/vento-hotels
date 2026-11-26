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
  // A PUT URL that accepts exactly this type and size, for `expiresInSeconds`.
  signedUpload(
    key: string,
    file: { contentType: string; size: number; expiresInSeconds: number },
  ): Promise<SignedUpload>
  // A GET URL for showing a file, for `expiresInSeconds`.
  signedDownload(key: string, expiresInSeconds: number): Promise<string>
  // The whole object, refusing anything larger than `maxBytes` without reading it.
  read(key: string, maxBytes: number): Promise<StoredObject>
  delete(key: string): Promise<void>
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

export class S3StorageProvider implements StorageProvider {
  readonly #client: AwsClient
  readonly #base: string

  constructor(settings: S3Settings) {
    this.#client = new AwsClient({
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      service: 's3',
      region: settings.region,
    })
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
    // Content type and length are signed, so storage refuses any other file under this URL.
    const signed = await this.#client.sign(this.#url(key, file.expiresInSeconds), {
      method: 'PUT',
      headers: { 'content-type': file.contentType, 'content-length': String(file.size) },
      aws: { signQuery: true, allHeaders: true },
    })
    // Browsers set Content-Length from the body themselves and refuse to have it set.
    return { url: signed.url, headers: { 'content-type': file.contentType } }
  }

  async signedDownload(key: string, expiresInSeconds: number): Promise<string> {
    const signed = await this.#client.sign(this.#url(key, expiresInSeconds), {
      method: 'GET',
      aws: { signQuery: true },
    })
    return signed.url
  }

  async read(key: string, maxBytes: number): Promise<StoredObject> {
    const response = await this.#client.fetch(this.#url(key), { method: 'GET' })
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
    const response = await this.#client.fetch(this.#url(key), { method: 'DELETE' })
    await response.body?.cancel()
    if (!response.ok && response.status !== 404) {
      throw new Error(`Storage answered ${response.status} deleting an object`)
    }
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const response = await this.#client.fetch(this.#url(key), {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: bytes,
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error(`Storage answered ${response.status} writing an object`)
  }

  // Local development only: create the bucket if it's missing and let any localhost web app upload
  // to it. R2's bucket and CORS rules are set up with the servers (docs/ops/deploy.md).
  async prepareLocalBucket(): Promise<void> {
    const head = await this.#client.fetch(this.#base, { method: 'HEAD' })
    await head.body?.cancel()
    if (head.status === 404) {
      const created = await this.#client.fetch(this.#base, { method: 'PUT' })
      await created.body?.cancel()
      if (!created.ok) throw new Error(`Storage answered ${created.status} creating the bucket`)
    }
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
      headers: { 'content-type': file.contentType },
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

  async put(key: string, bytes: Uint8Array, _contentType?: string): Promise<void> {
    this.files.set(key, bytes)
  }
}
