// Checks a PIN sign-in on a shared device (decision 0022): the device must be registered and live,
// the person must be able to see its hotel and have a PIN, and five wrong tries lock the PIN for
// 15 minutes. The Better Auth endpoint in auth.ts turns a success into a session.
import { verifyPassword } from 'better-auth/crypto'
import { and, eq, or, sql } from 'drizzle-orm'
import { recordAudit, recordSystemAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { members, users } from '../db/schema/auth.ts'
import { devices, memberPins, memberProperties } from '../db/schema/tenancy.ts'
import { deviceBySecret } from './service.ts'

export const PIN_TRIES = 5
export const PIN_LOCK_MINUTES = 15
// After this many lockouts without a successful sign-in, only a manager's reset unlocks the PIN,
// so a patient guesser at a shared tablet can't keep trying day after day.
export const PIN_LOCKS_BEFORE_RESET = 3

export type PinFailure =
  | { code: 'DEVICE_NOT_REGISTERED' }
  | { code: 'DEVICE_REVOKED' }
  | { code: 'CANT_SIGN_IN_HERE' }
  | { code: 'WRONG_PIN'; triesLeft: number }
  | { code: 'PIN_LOCKED'; lockedUntil: string }
  | { code: 'PIN_NEEDS_RESET' }

export type PinSuccess = {
  userId: string
  organizationId: string
  deviceId: string
  memberId: string
}

export class PinSignInError extends Error {
  readonly failure: PinFailure

  constructor(failure: PinFailure) {
    super(failure.code)
    this.failure = failure
  }
}

export async function checkPinSignIn(
  db: Database,
  input: { secret: string | undefined; memberId: string; pin: string },
): Promise<PinSuccess> {
  const device = await deviceBySecret(db, input.secret)
  if (!device) throw new PinSignInError({ code: 'DEVICE_NOT_REGISTERED' })
  if (device.revokedAt || device.propertyArchivedAt) {
    throw new PinSignInError({ code: 'DEVICE_REVOKED' })
  }

  // The transaction always commits (counting a wrong try must stick); the outcome is returned and
  // turned into an error afterwards.
  const outcome = await db.transaction(async (tx): Promise<PinSuccess | PinFailure> => {
    const [person] = await tx
      .select({
        memberId: members.id,
        userId: members.userId,
        name: users.name,
        pinId: memberPins.id,
        pinHash: memberPins.pinHash,
        failedAttempts: memberPins.failedAttempts,
        lockedUntil: memberPins.lockedUntil,
        lockCount: memberPins.lockCount,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .innerJoin(memberPins, eq(memberPins.memberId, members.id))
      .where(
        and(
          eq(members.id, input.memberId),
          eq(members.organizationId, device.organizationId),
          or(
            eq(members.allProperties, true),
            sql`${members.role} in ('owner', 'group_admin')`,
            sql`exists (select 1 from ${memberProperties} where ${memberProperties.memberId} = ${members.id} and ${memberProperties.propertyId} = ${device.propertyId})`,
          ),
        ),
      )
      .for('update', { of: memberPins })
    if (!person) return { code: 'CANT_SIGN_IN_HERE' }

    const now = new Date()
    if (person.lockCount >= PIN_LOCKS_BEFORE_RESET) return { code: 'PIN_NEEDS_RESET' }
    if (person.lockedUntil && person.lockedUntil > now) {
      return { code: 'PIN_LOCKED', lockedUntil: person.lockedUntil.toISOString() }
    }

    const right = await verifyPassword({ hash: person.pinHash, password: input.pin })
    if (!right) {
      const tries = person.failedAttempts + 1
      if (tries >= PIN_TRIES) {
        const lockedUntil = new Date(now.getTime() + PIN_LOCK_MINUTES * 60 * 1000)
        const lockCount = person.lockCount + 1
        await tx
          .update(memberPins)
          .set({ failedAttempts: 0, lockedUntil, lockCount, updatedAt: now })
          .where(eq(memberPins.id, person.pinId))
        await recordSystemAudit(
          tx,
          device.organizationId,
          {
            action: 'pin.locked',
            entityType: 'member',
            entityId: person.memberId,
            propertyId: device.propertyId,
            deviceId: device.id,
            after: {
              name: person.name,
              device: device.name,
              lockedUntil: lockedUntil.toISOString(),
              lockCount,
              needsReset: lockCount >= PIN_LOCKS_BEFORE_RESET,
            },
          },
          'Lock screen',
        )
        if (lockCount >= PIN_LOCKS_BEFORE_RESET) return { code: 'PIN_NEEDS_RESET' }
        return { code: 'PIN_LOCKED', lockedUntil: lockedUntil.toISOString() }
      }
      await tx
        .update(memberPins)
        .set({ failedAttempts: tries, updatedAt: now })
        .where(eq(memberPins.id, person.pinId))
      return { code: 'WRONG_PIN', triesLeft: PIN_TRIES - tries }
    }

    await tx
      .update(memberPins)
      .set({ failedAttempts: 0, lockedUntil: null, lockCount: 0, updatedAt: now })
      .where(eq(memberPins.id, person.pinId))
    await tx.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, device.id))
    await recordAudit(
      tx,
      {
        organizationId: device.organizationId,
        userId: person.userId,
        memberId: person.memberId,
        userName: person.name,
        deviceId: device.id,
      },
      {
        action: 'member.signed_in_with_pin',
        entityType: 'member',
        entityId: person.memberId,
        propertyId: device.propertyId,
        after: { device: device.name },
      },
    )
    return {
      userId: person.userId,
      organizationId: device.organizationId,
      deviceId: device.id,
      memberId: person.memberId,
    }
  })

  if ('code' in outcome) throw new PinSignInError(outcome)
  return outcome
}
