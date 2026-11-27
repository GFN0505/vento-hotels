// The wrong-try counter behind every PIN check (decision 0022): five wrong tries lock the PIN for
// 15 minutes, and after three lockouts only a manager's reset unlocks it. The lock screen and the
// approval prompt share it (decision 0027), so tries at one add up with tries at the other.
// Callers hold the member_pins row FOR UPDATE and commit whatever this returns: a wrong try must
// stick even though the action it was for is refused.
import { verifyPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { type Actor, recordAudit, recordSystemAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { memberPins } from '../db/schema/tenancy.ts'

export const PIN_TRIES = 5
export const PIN_LOCK_MINUTES = 15
export const PIN_LOCKS_BEFORE_RESET = 3

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export type PinRow = {
  pinId: string
  pinHash: string
  failedAttempts: number
  lockedUntil: Date | null
  lockCount: number
  memberId: string
  name: string
}

export type PinCheck =
  | { ok: true }
  | { code: 'WRONG_PIN'; triesLeft: number }
  | { code: 'PIN_LOCKED'; lockedUntil: string }
  | { code: 'PIN_NEEDS_RESET' }

export type PinWhere = {
  organizationId: string
  propertyId: string
  deviceId: string | null
  deviceName: string | null
  // Who the lockout event names as acting: "Lock screen", "Approvals".
  actorLabel: string
  // The signed-in member whose screen the PIN was typed on (approvals): the lockout event names
  // them as the actor, so a desk locking out managers is visible in the audit log.
  actor?: Actor | undefined
}

// Whether the PIN can be tried at all, without trying it.
export function pinBlocked(row: Pick<PinRow, 'lockCount' | 'lockedUntil'>, now = new Date()) {
  if (row.lockCount >= PIN_LOCKS_BEFORE_RESET) return { code: 'PIN_NEEDS_RESET' as const }
  if (row.lockedUntil && row.lockedUntil > now) {
    return { code: 'PIN_LOCKED' as const, lockedUntil: row.lockedUntil.toISOString() }
  }
  return undefined
}

export async function tryPin(tx: Tx, row: PinRow, pin: string, where: PinWhere): Promise<PinCheck> {
  const now = new Date()
  const blocked = pinBlocked(row, now)
  if (blocked) return blocked

  const right = await verifyPassword({ hash: row.pinHash, password: pin })
  if (right) {
    await tx
      .update(memberPins)
      .set({ failedAttempts: 0, lockedUntil: null, lockCount: 0, updatedAt: now })
      .where(eq(memberPins.id, row.pinId))
    return { ok: true }
  }
  const tries = row.failedAttempts + 1
  if (tries < PIN_TRIES) {
    await tx
      .update(memberPins)
      .set({ failedAttempts: tries, updatedAt: now })
      .where(eq(memberPins.id, row.pinId))
    return { code: 'WRONG_PIN', triesLeft: PIN_TRIES - tries }
  }
  const lockedUntil = new Date(now.getTime() + PIN_LOCK_MINUTES * 60 * 1000)
  const lockCount = row.lockCount + 1
  await tx
    .update(memberPins)
    .set({ failedAttempts: 0, lockedUntil, lockCount, updatedAt: now })
    .where(eq(memberPins.id, row.pinId))
  const event = {
    action: 'pin.locked',
    entityType: 'member',
    entityId: row.memberId,
    propertyId: where.propertyId,
    deviceId: where.deviceId,
    after: {
      name: row.name,
      device: where.deviceName,
      lockedUntil: lockedUntil.toISOString(),
      lockCount,
      needsReset: lockCount >= PIN_LOCKS_BEFORE_RESET,
      ...(where.actor
        ? {
            via: where.actorLabel,
            typedBy: where.actor.userName,
            typedByMemberId: where.actor.memberId,
          }
        : {}),
    },
  }
  if (where.actor) await recordAudit(tx, where.actor, event)
  else await recordSystemAudit(tx, where.organizationId, event, where.actorLabel)
  if (lockCount >= PIN_LOCKS_BEFORE_RESET) return { code: 'PIN_NEEDS_RESET' }
  return { code: 'PIN_LOCKED', lockedUntil: lockedUntil.toISOString() }
}
