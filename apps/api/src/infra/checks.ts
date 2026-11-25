import pg from 'pg'

export type CheckResult = { ok: true; detail: string } | { ok: false; error: string }

const TIMEOUT_MS = 3000

// Connection-refused errors from Node often arrive as an AggregateError with an empty message,
// so fall back to the first inner error, then the error code, so the user always sees a reason.
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  if (error.message) return error.message
  if (error instanceof AggregateError) {
    const inner = error.errors.find((e): e is Error => e instanceof Error && e.message !== '')
    if (inner) return inner.message
  }
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? `${code} (is the service running?)` : 'Unknown error'
}

// Connects, asks for the server version, and disconnects. Never logs the URL: it holds a password.
export async function checkPostgres(databaseUrl: string): Promise<CheckResult> {
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: TIMEOUT_MS,
  })
  try {
    await client.connect()
    const result = await client.query<{ version: string }>(
      "select current_setting('server_version') as version",
    )
    const version = result.rows[0]?.version ?? 'unknown'
    return { ok: true, detail: `Postgres ${version}` }
  } catch (error) {
    return { ok: false, error: describe(error) }
  } finally {
    await client.end().catch(() => undefined)
  }
}

// The storage health endpoint needs no credentials, so this works for RustFS locally
// and for any S3-compatible service that exposes /health.
export async function checkStorage(endpoint: string): Promise<CheckResult> {
  try {
    const response = await fetch(`${endpoint}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return response.ok
      ? { ok: true, detail: `Storage healthy at ${endpoint}` }
      : { ok: false, error: `Storage answered ${response.status} at ${endpoint}` }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}
