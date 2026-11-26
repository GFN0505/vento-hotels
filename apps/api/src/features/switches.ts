// The Vento team's feature switches for one group (decision 0021): list, on, off, reset. Used by
// `pnpm features`; there's deliberately no API for hotels to call.
import { FEATURE_KEYS, FEATURES, type Feature, featuresOn, isFeature } from '@vento/shared'
import { and, eq, or } from 'drizzle-orm'
import { recordSystemAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { organizations } from '../db/schema/auth.ts'
import { organizationFeatures } from '../db/schema/governance.ts'

export const VENTO_TEAM = 'Vento team'

export class SwitchError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A group by its slug (as in Better Auth) or id.
export async function findGroup(db: Database, ref: string) {
  const [group] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(
      UUID.test(ref)
        ? or(eq(organizations.id, ref), eq(organizations.slug, ref))
        : eq(organizations.slug, ref),
    )
  if (!group) throw new SwitchError(`No hotel group with slug or id "${ref}"`)
  return group
}

export type FeatureState = {
  feature: Feature
  label: string
  on: boolean
  why: 'released' | 'not released' | 'switched on' | 'switched off'
  reason: string | null
}

export async function listGroupFeatures(db: Database, groupId: string): Promise<FeatureState[]> {
  const rows = await db
    .select({
      feature: organizationFeatures.feature,
      enabled: organizationFeatures.enabled,
      reason: organizationFeatures.reason,
    })
    .from(organizationFeatures)
    .where(eq(organizationFeatures.organizationId, groupId))
  const own = new Map(rows.map((row) => [row.feature, row]))
  const on = new Set(featuresOn(new Map(rows.map((row) => [row.feature, row.enabled]))))
  return FEATURE_KEYS.map((feature) => {
    const row = own.get(feature)
    return {
      feature,
      label: FEATURES[feature].label,
      on: on.has(feature),
      why: row
        ? row.enabled
          ? 'switched on'
          : 'switched off'
        : FEATURES[feature].released
          ? 'released'
          : 'not released',
      reason: row?.reason ?? null,
    }
  })
}

export async function switchFeature(
  db: Database,
  groupId: string,
  input: { feature: string; to: 'on' | 'off' | 'reset'; reason: string },
): Promise<void> {
  if (!isFeature(input.feature)) {
    throw new SwitchError(`Unknown feature "${input.feature}". Known: ${FEATURE_KEYS.join(', ')}`)
  }
  const reason = input.reason.trim()
  if (reason.length < 3) throw new SwitchError('Give a reason with --reason "…"')
  const feature = input.feature
  const where = and(
    eq(organizationFeatures.organizationId, groupId),
    eq(organizationFeatures.feature, feature),
  )

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ enabled: organizationFeatures.enabled })
      .from(organizationFeatures)
      .where(where)
      .for('update')
    if (input.to === 'reset') {
      await tx.delete(organizationFeatures).where(where)
    } else {
      const enabled = input.to === 'on'
      await tx
        .insert(organizationFeatures)
        .values({ organizationId: groupId, feature, enabled, reason })
        .onConflictDoUpdate({
          target: [organizationFeatures.organizationId, organizationFeatures.feature],
          set: { enabled, reason, updatedAt: new Date() },
        })
    }
    await recordSystemAudit(
      tx,
      groupId,
      {
        action: input.to === 'reset' ? 'feature.reset' : `feature.switched_${input.to}`,
        entityType: 'feature',
        entityId: null,
        before: { feature, switch: before ? (before.enabled ? 'on' : 'off') : 'default' },
        after: { feature, switch: input.to === 'reset' ? 'default' : input.to },
        reason,
      },
      VENTO_TEAM,
    )
  })
}
