// Server-side rules for PIN sessions on shared devices (decision 0022). The browser locks the
// device when idle, but the server can't rely on that: power and internet cuts, reloads and copied
// cookies all happen. Checked on every API call made in a PIN session.
import { ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { sessions } from '../db/schema/auth.ts'
import { devices } from '../db/schema/tenancy.ts'
import { deviceSecretFrom, hashSecret, idleSecondsFor } from './service.ts'

// A PIN session lasts a shift at most.
export const PIN_SESSION_HOURS = 12
// Slack on top of the device's idle time for clocks and slow networks.
const IDLE_GRACE_SECONDS = 30
// Activity is written at most this often, to keep busy tablets cheap.
const ACTIVITY_WRITE_SECONDS = 15

const signedOut = (why: string) =>
  new ORPCError('UNAUTHORIZED', { message: why, data: { code: 'DEVICE_SESSION_ENDED' } })

// Reads the app makes on its own, without anyone touching the device: the waiting screen's poll and
// the bell's count (spec stage-1-approvals.md). They are still checked, but don't keep a waiting
// shared PC awake, so it still locks after its idle time.
export const BACKGROUND_PROCEDURES: ReadonlySet<string> = new Set([
  'approvals.get',
  'approvals.count',
])

export async function guardDeviceSession(
  db: Database,
  session: { id: string; createdAt: Date; deviceId: string },
  headers: Headers,
  options: { background?: boolean } = {},
): Promise<void> {
  const [row] = await db
    .select({
      tokenHash: devices.tokenHash,
      kind: devices.kind,
      revokedAt: devices.revokedAt,
      activeAt: sessions.deviceActiveAt,
    })
    .from(sessions)
    .innerJoin(devices, eq(devices.id, sessions.deviceId))
    .where(eq(sessions.id, session.id))

  const end = async (why: string) => {
    await db.delete(sessions).where(eq(sessions.id, session.id))
    throw signedOut(why)
  }
  if (!row || row.revokedAt) return end('This device was removed. Ask a manager.')

  // The session only works on the device it was made on: a copied cookie is useless elsewhere.
  const secret = deviceSecretFrom(headers)
  if (!secret || hashSecret(secret) !== row.tokenHash) return end('Sign in on the shared device')

  const now = Date.now()
  if (now - session.createdAt.getTime() > PIN_SESSION_HOURS * 60 * 60 * 1000) {
    return end('Your shift session ended. Sign in again with your PIN.')
  }
  const last = (row.activeAt ?? session.createdAt).getTime()
  if (now - last > (idleSecondsFor(row.kind) + IDLE_GRACE_SECONDS) * 1000) {
    return end('Signed out after inactivity')
  }
  if (!options.background && now - last > ACTIVITY_WRITE_SECONDS * 1000) {
    await db
      .update(sessions)
      .set({ deviceActiveAt: new Date(now) })
      .where(eq(sessions.id, session.id))
  }
}
