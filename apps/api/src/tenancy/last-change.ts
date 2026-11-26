// Who saved a record last and when, in the hotel's time, for the "someone else saved first"
// message: "Tunde changed Kora Victoria Island at 14:02."
import { and, desc, eq, inArray } from 'drizzle-orm'
import { auditEvents } from '../db/schema/governance.ts'
import type { Reader } from './property-views.ts'

export async function lastChangeBy(
  db: Reader,
  record: {
    organizationId: string
    entityType: string
    entityId: string
    actions: readonly string[]
    timeZone: string
  },
): Promise<{ name: string; at: string } | null> {
  const [event] = await db
    .select({ actorName: auditEvents.actorName, createdAt: auditEvents.createdAt })
    .from(auditEvents)
    .where(
      // Leads with the organization, matching the (organization_id, entity_type, entity_id) index.
      and(
        eq(auditEvents.organizationId, record.organizationId),
        eq(auditEvents.entityType, record.entityType),
        eq(auditEvents.entityId, record.entityId),
        inArray(auditEvents.action, [...record.actions]),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(1)
  if (!event) return null
  const at = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: record.timeZone,
  }).format(event.createdAt)
  return { name: event.actorName?.split(' ')[0] ?? 'Someone', at }
}
