// Test helpers: a real app on the test database, driven over HTTP the way the web app will drive
// it (sign up, verify email, sign in, cookies, /rpc). Used by tests that need sign-in.
import { newId } from '@vento/shared'
import { createApp } from '../app.ts'
import { createAuth } from '../auth/auth.ts'
import { createDatabase } from '../db/client.ts'
import { MemoryEmailProvider } from '../providers/email.ts'
import type { HealthCheck } from '../system/health.ts'

export const WEB_ORIGIN = 'http://localhost:5180'
const PASSWORD = 'correct-horse-battery-staple'

const healthy: HealthCheck = async () => ({
  status: 'ok',
  checks: { database: { ok: true, detail: 'test' }, storage: { ok: true, detail: 'test' } },
  checkedAt: new Date().toISOString(),
})

export function createTestApp(databaseUrl: string) {
  const database = createDatabase(databaseUrl, { max: 4 })
  const email = new MemoryEmailProvider()
  const auth = createAuth({
    db: database.db,
    settings: {
      secret: 'test-only-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:5180',
      webOrigin: WEB_ORIGIN,
    },
    email,
  })
  const app = createApp({ db: database.db, auth, checkHealth: healthy })

  async function call(path: string, init: { method?: string; body?: unknown; cookie?: string }) {
    const headers: Record<string, string> = { origin: WEB_ORIGIN }
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    if (init.cookie) headers.cookie = init.cookie
    return app.request(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    })
  }

  function cookieFrom(response: Response): string {
    return response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
  }

  // Signs up, verifies the email from the captured message, signs in. Returns the session cookie.
  async function signUp(name: string): Promise<{ cookie: string; userId: string; email: string }> {
    const email_ = `${name.toLowerCase().replace(/\W+/g, '.')}.${newId().slice(-8)}@example.test`
    const signUpResponse = await call('/api/auth/sign-up/email', {
      body: { name, email: email_, password: PASSWORD },
    })
    if (!signUpResponse.ok) throw new Error(`sign-up failed: ${signUpResponse.status}`)
    const userId = ((await signUpResponse.json()) as { user: { id: string } }).user.id

    const link = email.lastTo(email_)?.text.match(/https?:\/\/\S+/)?.[0]
    if (!link) throw new Error('no verification email captured')
    const url = new URL(link)
    await call(`${url.pathname}${url.search}`, {})

    const signIn = await call('/api/auth/sign-in/email', {
      body: { email: email_, password: PASSWORD },
    })
    if (!signIn.ok) throw new Error(`sign-in failed: ${signIn.status}`)
    return { cookie: cookieFrom(signIn), userId, email: email_ }
  }

  async function createOrganization(cookie: string, name: string): Promise<string> {
    const response = await call('/api/auth/organization/create', {
      cookie,
      body: { name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${newId().slice(-8)}` },
    })
    if (!response.ok) throw new Error(`organization create failed: ${response.status}`)
    return ((await response.json()) as { id: string }).id
  }

  // Adds an existing user to an organization (what accepting an invitation does) and makes it their
  // active organization.
  async function addMember(
    organizationId: string,
    user: { userId: string; cookie: string },
    role: string,
  ) {
    await auth.api.addMember({
      body: { organizationId, userId: user.userId, role: role as 'owner' },
    })
    const response = await call('/api/auth/organization/set-active', {
      cookie: user.cookie,
      body: { organizationId },
    })
    if (!response.ok) throw new Error(`set-active failed: ${response.status}`)
  }

  // Calls an oRPC procedure over HTTP (e.g. 'properties/list') and returns status and data.
  async function rpc<T = unknown>(cookie: string | undefined, path: string, input?: unknown) {
    const response = await call(`/rpc/${path}`, {
      ...(cookie ? { cookie } : {}),
      body: input === undefined ? {} : { json: input },
    })
    const body = (await response.json()) as { json?: T & { message?: string } }
    return { status: response.status, data: body.json as T & { message?: string } }
  }

  return {
    app,
    auth,
    email,
    db: database.db,
    close: database.close,
    call,
    signUp,
    createOrganization,
    addMember,
    rpc,
  }
}
