// Two-step sign-in through the real HTTP flow (spec: docs/specs/stage-0-two-step-sign-in.md).
import { createHmac } from 'node:crypto'
import type { AuditEventView, MemberView } from '@vento/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, PASSWORD } from '../test/harness.ts'

const url = process.env.TEST_DATABASE_URL

// What an authenticator app does: base32 secret → HMAC-SHA1 of the 30-second counter → 6 digits.
function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of secretBase32.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, '0')
}

const cookiesFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')

describe.skipIf(!url)('two-step sign-in', () => {
  const t = createTestApp(url ?? '')
  afterAll(() => t.close())

  let owner: { cookie: string; userId: string; email: string }
  let secret: string
  let backupCodes: string[]

  let otherDevice: string
  let secondGroupOwner: { cookie: string; userId: string; email: string }
  let secondGroupId: string

  const auditActions = async (cookie: string) =>
    (await t.rpc<{ items: AuditEventView[] }>(cookie, 'audit/list', { pageSize: 100 })).data.items
      .filter((e) => e.action.startsWith('two_step.'))
      .map((e) => e.action)

  beforeAll(async () => {
    owner = await t.signUp('Folake Nwosu')
    await t.createOrganization(owner.cookie, 'Kora Hotels Group')
    // A second group Folake also belongs to: two-step changes are recorded there too.
    secondGroupOwner = await t.signUp('Second Group Owner')
    secondGroupId = await t.createOrganization(secondGroupOwner.cookie, 'Second Group')
    await t.auth.api.addMember({
      body: { organizationId: secondGroupId, userId: owner.userId, role: 'viewer' as 'owner' },
    })
    // Folake is also signed in on another computer.
    const elsewhere = await t.call('/api/auth/sign-in/email', {
      body: { email: owner.email, password: PASSWORD },
    })
    otherDevice = cookiesFrom(elsewhere)
  })

  it('turns on with the password and a first code, and is recorded in the audit log', async () => {
    const enable = await t.call('/api/auth/two-factor/enable', {
      cookie: owner.cookie,
      body: { password: PASSWORD },
    })
    expect(enable.status).toBe(200)
    const body = (await enable.json()) as { totpURI: string; backupCodes: string[] }
    secret = new URL(body.totpURI).searchParams.get('secret') ?? ''
    backupCodes = body.backupCodes
    expect(new URL(body.totpURI).searchParams.get('issuer')).toBe('Vento Hotels')
    expect(backupCodes).toHaveLength(10)

    // Not on until a first code proves the app is set up.
    const before = await t.rpc<{ twoStep: boolean }>(owner.cookie, 'organization/current')
    expect(before.data.twoStep).toBe(false)

    const verify = await t.call('/api/auth/two-factor/verify-totp', {
      cookie: owner.cookie,
      body: { code: totp(secret) },
    })
    expect(verify.status).toBe(200)
    // Turning it on starts a fresh session (Better Auth revokes the old one).
    const fresh = cookiesFrom(verify)
    if (fresh) owner = { ...owner, cookie: fresh }
    const after = await t.rpc<{ twoStep: boolean }>(owner.cookie, 'organization/current')
    expect(after.data.twoStep).toBe(true)

    const members = await t.rpc<{ items: MemberView[] }>(owner.cookie, 'members/list', {})
    expect(members.data.items[0]?.twoStep).toBe(true)
    expect(await auditActions(owner.cookie)).toEqual(['two_step.turned_on'])
    expect(await auditActions(secondGroupOwner.cookie)).toEqual(['two_step.turned_on'])

    // Turning it on signs out everywhere else: a stolen password may already be in use.
    const elsewhere = await t.call('/api/auth/get-session', { cookie: otherDevice })
    expect(await elsewhere.json()).toBeNull()

    // Entering another code while it's already on isn't a change, and isn't recorded.
    const again = await t.call('/api/auth/two-factor/verify-totp', {
      cookie: owner.cookie,
      body: { code: totp(secret) },
    })
    const rotated = cookiesFrom(again)
    if (rotated) owner = { ...owner, cookie: rotated }
    expect(await auditActions(owner.cookie)).toEqual(['two_step.turned_on'])
  })

  it('asks for the code after the password, and lets you in with it', async () => {
    const signIn = await t.call('/api/auth/sign-in/email', {
      body: { email: owner.email, password: PASSWORD },
    })
    expect(signIn.status).toBe(200)
    expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true })
    const pending = cookiesFrom(signIn)
    // The password alone gives no session.
    const none = await t.call('/api/auth/get-session', { cookie: pending })
    expect(await none.json()).toBeNull()

    const wrong = await t.call('/api/auth/two-factor/verify-totp', {
      cookie: pending,
      body: { code: '000000' },
    })
    expect(wrong.status).toBe(401)

    const right = await t.call('/api/auth/two-factor/verify-totp', {
      cookie: pending,
      body: { code: totp(secret), trustDevice: true },
    })
    expect(right.status).toBe(200)
    const session = cookiesFrom(right)
    const signedIn = await t.call('/api/auth/get-session', { cookie: session })
    expect(((await signedIn.json()) as { user?: { email: string } } | null)?.user?.email).toBe(
      owner.email,
    )

    // A trusted computer isn't asked again.
    const again = await t.call('/api/auth/sign-in/email', {
      cookie: cookiesFrom(right),
      body: { email: owner.email, password: PASSWORD },
    })
    expect(await again.json()).not.toMatchObject({ twoFactorRedirect: true })
  })

  it('accepts a backup code once', async () => {
    const signIn = await t.call('/api/auth/sign-in/email', {
      body: { email: owner.email, password: PASSWORD },
    })
    const pending = cookiesFrom(signIn)
    const code = backupCodes[0] ?? ''
    const first = await t.call('/api/auth/two-factor/verify-backup-code', {
      cookie: pending,
      body: { code },
    })
    expect(first.status).toBe(200)

    const signInAgain = await t.call('/api/auth/sign-in/email', {
      body: { email: owner.email, password: PASSWORD },
    })
    const reused = await t.call('/api/auth/two-factor/verify-backup-code', {
      cookie: cookiesFrom(signInAgain),
      body: { code },
    })
    expect(reused.status).toBe(401)
  })

  it('turns off with the password, recorded too', async () => {
    const off = await t.call('/api/auth/two-factor/disable', {
      cookie: owner.cookie,
      body: { password: PASSWORD },
    })
    expect(off.status).toBe(200)
    owner = { ...owner, cookie: cookiesFrom(off) || owner.cookie }
    expect(await auditActions(owner.cookie)).toEqual(['two_step.turned_off', 'two_step.turned_on'])
    const signIn = await t.call('/api/auth/sign-in/email', {
      body: { email: owner.email, password: PASSWORD },
    })
    expect(await signIn.json()).not.toMatchObject({ twoFactorRedirect: true })
  })
})

describe('backup codes', () => {
  it('are easy to read from paper: no look-alike characters', async () => {
    const { readableBackupCodes } = await import('./auth.ts')
    const codes = readableBackupCodes()
    expect(codes).toHaveLength(10)
    for (const code of codes) expect(code).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/)
    expect(new Set(codes).size).toBe(10)
  })
})
