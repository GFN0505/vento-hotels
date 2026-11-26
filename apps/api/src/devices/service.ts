// Shared devices and staff PINs (spec: docs/specs/stage-0-devices-and-pin.md, decision 0022).
import { createHash, randomBytes } from 'node:crypto'
import { ORPCError } from '@orpc/server'
import {
  DEVICE_KINDS,
  type DeviceKind,
  type DeviceView,
  type LockScreen,
  type MemberRole,
  type PageQuery,
  pageOffset,
  toPage,
} from '@vento/shared'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { and, asc, count, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { accounts, members, organizations, sessions, users } from '../db/schema/auth.ts'
import { devices, memberPins, memberProperties, properties } from '../db/schema/tenancy.ts'
import { requireCanManage, visibleMembers } from '../team/rules.ts'
import {
  type Access,
  propertyScope,
  requireListableHotel,
  requirePermission,
} from '../tenancy/access.ts'

type Reader = Pick<Database, 'select'>

export const DEVICE_COOKIE = 'vento_device'
// Browsers cap cookie lifetimes at 400 days; a registered device stays registered until revoked.
const DEVICE_COOKIE_DAYS = 400

const notFound = () => new ORPCError('NOT_FOUND', { message: "We couldn't find that device" })

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

// The device secret from this request's cookies, if any.
export function deviceSecretFrom(headers: Headers): string | undefined {
  const cookie = headers.get('cookie') ?? ''
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === DEVICE_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export function deviceCookie(secret: string, secure: boolean): string {
  return [
    `${DEVICE_COOKIE}=${encodeURIComponent(secret)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${DEVICE_COOKIE_DAYS * 24 * 60 * 60}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

const deviceColumns = {
  id: devices.id,
  name: devices.name,
  kind: devices.kind,
  propertyId: devices.propertyId,
  propertyName: properties.name,
  lastSeenAt: devices.lastSeenAt,
  revokedAt: devices.revokedAt,
  revokedReason: devices.revokedReason,
  tokenHash: devices.tokenHash,
}

type DeviceRow = {
  id: string
  name: string
  kind: string
  propertyId: string
  propertyName: string
  lastSeenAt: Date | null
  revokedAt: Date | null
  revokedReason: string | null
  tokenHash: string
}

function toView(row: DeviceRow, thisDeviceHash: string | undefined): DeviceView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as DeviceKind,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedReason: row.revokedReason,
    isThisDevice: row.tokenHash === thisDeviceHash,
  }
}

export async function listDevices(
  db: Database,
  access: Access,
  query: PageQuery & { propertyId?: string | undefined },
  headers: Headers,
) {
  requirePermission(access, 'setup.manage')
  if (query.propertyId) await requireListableHotel(db, access, query.propertyId)
  // One hotel's devices, or every device at an active hotel: an archived hotel's devices were
  // revoked with it, and their history stays in the audit log.
  const where = and(
    eq(devices.organizationId, access.organizationId),
    propertyScope(access),
    query.propertyId ? eq(devices.propertyId, query.propertyId) : isNull(properties.archivedAt),
  )
  const secret = deviceSecretFrom(headers)
  const [rows, [total]] = await Promise.all([
    db
      .select(deviceColumns)
      .from(devices)
      .innerJoin(properties, eq(properties.id, devices.propertyId))
      .where(where)
      // Live devices first, then by hotel (one hotel: all the same), then by name.
      .orderBy(
        sql`${devices.revokedAt} is not null`,
        asc(properties.name),
        asc(devices.name),
        asc(devices.id),
      )
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db
      .select({ value: count() })
      .from(devices)
      .innerJoin(properties, eq(properties.id, devices.propertyId))
      .where(where),
  ])
  const thisHash = secret ? hashSecret(secret) : undefined
  return toPage(
    rows.map((row) => toView(row, thisHash)),
    total?.value ?? 0,
    query,
  )
}

async function findDevice(db: Reader, access: Access, id: string): Promise<DeviceRow> {
  const [row] = await db
    .select(deviceColumns)
    .from(devices)
    .innerJoin(properties, eq(properties.id, devices.propertyId))
    .where(
      and(
        eq(devices.id, id),
        eq(devices.organizationId, access.organizationId),
        propertyScope(access),
      ),
    )
  if (!row) throw notFound()
  return row
}

const nameTaken = () =>
  new ORPCError('CONFLICT', { message: 'A device with this name already exists. Try another.' })

// Registers the browser making the request. Returns the cookie to set, so the caller can attach it.
export async function registerDevice(
  db: Database,
  access: Access,
  input: { name: string; kind: DeviceKind; propertyId: string },
): Promise<{ device: DeviceView; secret: string }> {
  requirePermission(access, 'setup.manage')
  const secret = randomBytes(32).toString('base64url')
  try {
    const device = await db.transaction(async (tx) => {
      const [property] = await tx
        .select({ id: properties.id, name: properties.name })
        .from(properties)
        .where(
          and(
            eq(properties.id, input.propertyId),
            propertyScope(access),
            isNull(properties.archivedAt),
          ),
        )
        // Held until the device is saved, so a hotel can't be archived meanwhile; archiving waits,
        // then revokes this device with the others.
        .for('share')
      if (!property) {
        throw new ORPCError('BAD_REQUEST', { message: 'Choose one of your hotels' })
      }
      const [row] = await tx
        .insert(devices)
        .values({
          organizationId: access.organizationId,
          propertyId: property.id,
          name: input.name,
          kind: input.kind,
          tokenHash: hashSecret(secret),
        })
        .returning({ id: devices.id })
      if (!row) throw new Error('device insert returned nothing')
      await recordAudit(tx, access, {
        action: 'device.registered',
        entityType: 'device',
        entityId: row.id,
        propertyId: property.id,
        after: { name: input.name, kind: input.kind, propertyName: property.name },
      })
      return findDevice(tx, access, row.id)
    })
    return { device: toView(device, hashSecret(secret)), secret }
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

export async function renameDevice(
  db: Database,
  access: Access,
  input: { id: string; name: string },
): Promise<DeviceView> {
  requirePermission(access, 'setup.manage')
  try {
    return await db.transaction(async (tx) => {
      const device = await findDevice(tx, access, input.id)
      await tx.update(devices).set({ name: input.name }).where(eq(devices.id, device.id))
      await recordAudit(tx, access, {
        action: 'device.renamed',
        entityType: 'device',
        entityId: device.id,
        propertyId: device.propertyId,
        before: { name: device.name },
        after: { name: input.name },
      })
      return toView({ ...device, name: input.name }, undefined)
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

// Revoking ends every session on the device at once and makes its cookie worthless.
export async function revokeDevice(
  db: Database,
  access: Access,
  input: { id: string; reason: string },
): Promise<{ ok: true }> {
  requirePermission(access, 'setup.manage')
  await db.transaction(async (tx) => {
    const device = await findDevice(tx, access, input.id)
    if (device.revokedAt) return
    await tx
      .update(devices)
      .set({ revokedAt: new Date(), revokedReason: input.reason })
      .where(eq(devices.id, device.id))
    await tx.delete(sessions).where(eq(sessions.deviceId, device.id))
    await recordAudit(tx, access, {
      action: 'device.revoked',
      entityType: 'device',
      entityId: device.id,
      propertyId: device.propertyId,
      before: { name: device.name },
      reason: input.reason,
    })
  })
  return { ok: true }
}

// The device behind a cookie secret, live or revoked.
export async function deviceBySecret(db: Reader, secret: string | undefined) {
  if (!secret) return undefined
  const [device] = await db
    .select({
      id: devices.id,
      organizationId: devices.organizationId,
      organizationName: organizations.name,
      propertyId: devices.propertyId,
      propertyName: properties.name,
      name: devices.name,
      kind: devices.kind,
      revokedAt: devices.revokedAt,
      lastSeenAt: devices.lastSeenAt,
      propertyArchivedAt: properties.archivedAt,
    })
    .from(devices)
    .innerJoin(properties, eq(properties.id, devices.propertyId))
    .innerJoin(organizations, eq(organizations.id, devices.organizationId))
    .where(eq(devices.tokenHash, hashSecret(secret)))
  return device
}

function displayName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/)
  const last = rest.at(-1)
  return last ? `${first} ${last[0]?.toUpperCase()}.` : (first ?? name)
}

// Who can sign in on this device: people who can see its hotel and have set a PIN.
export async function lockScreen(db: Database, headers: Headers): Promise<LockScreen> {
  const device = await deviceBySecret(db, deviceSecretFrom(headers))
  if (!device) return { status: 'unregistered' }
  // A device whose hotel was archived is as good as removed.
  if (device.revokedAt || device.propertyArchivedAt) {
    return { status: 'revoked', organizationName: device.organizationName }
  }
  const people = await db
    .select({ memberId: members.id, name: users.name, role: members.role })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(memberPins, eq(memberPins.memberId, members.id))
    .where(
      and(
        eq(members.organizationId, device.organizationId),
        or(
          eq(members.allProperties, true),
          sql`${members.role} in ('owner', 'group_admin')`,
          sql`exists (select 1 from ${memberProperties} where ${memberProperties.memberId} = ${members.id} and ${memberProperties.propertyId} = ${device.propertyId})`,
        ),
      ),
    )
    .orderBy(asc(users.name))
  // "Last used" only needs minute-ish accuracy; don't write on every lock-screen load.
  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, device.id))
  }
  return {
    status: 'ready',
    device: {
      name: device.name,
      kind: device.kind as DeviceKind,
      propertyName: device.propertyName,
    },
    people: people.map((p) => ({
      memberId: p.memberId,
      displayName: displayName(p.name),
      role: p.role as MemberRole,
    })),
  }
}

export function idleSecondsFor(kind: string): number {
  return DEVICE_KINDS[kind as DeviceKind]?.idleSeconds ?? 300
}

// --- PINs -----------------------------------------------------------------------------------------

// Sets your own PIN. Needs your password, so someone at an unlocked computer can't set it for you,
// and a PIN session can't set one (it has no password behind it).
export async function setOwnPin(
  db: Database,
  access: Access,
  input: { pin: string; password: string },
): Promise<{ ok: true }> {
  if (access.deviceId) {
    throw new ORPCError('FORBIDDEN', { message: 'Set your PIN when signed in with your password' })
  }
  const [account] = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, access.userId), eq(accounts.providerId, 'credential')))
  const valid = account?.password
    ? await verifyPassword({ hash: account.password, password: input.password })
    : false
  if (!valid) throw new ORPCError('BAD_REQUEST', { message: "That password isn't right" })
  const pinHash = await hashPassword(input.pin)
  await db.transaction(async (tx) => {
    await tx
      .insert(memberPins)
      .values({ organizationId: access.organizationId, memberId: access.memberId, pinHash })
      .onConflictDoUpdate({
        target: memberPins.memberId,
        set: { pinHash, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() },
      })
    await recordAudit(tx, access, {
      action: 'pin.set',
      entityType: 'member',
      entityId: access.memberId,
    })
  })
  return { ok: true }
}

// A manager clears someone's PIN (forgotten, or shared); they set a new one themselves. Same reach
// as managing that person: their hotels only, and owners and admins only by an owner. Ends their
// PIN sessions too, since "it was shared" is a common reason for a reset.
export async function resetPin(
  db: Database,
  access: Access,
  memberId: string,
): Promise<{ ok: true }> {
  requirePermission(access, 'setup.manage')
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: members.id, userId: members.userId, name: users.name, role: members.role })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.id, memberId), visibleMembers(access)))
    if (!target) throw new ORPCError('NOT_FOUND', { message: "We couldn't find that person" })
    await requireCanManage(tx, access, target.role)
    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, target.userId), isNotNull(sessions.deviceId)))
    const removed = await tx
      .delete(memberPins)
      .where(eq(memberPins.memberId, target.id))
      .returning({ id: memberPins.id })
    if (removed.length === 0) return
    await recordAudit(tx, access, {
      action: 'pin.reset',
      entityType: 'member',
      entityId: target.id,
      before: { name: target.name },
    })
  })
  return { ok: true }
}
