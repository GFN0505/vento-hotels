// Go-live (docs/DOMAIN.md): a property is live once its first night audit has completed, which
// sets properties.live_since. After that, changes that move sellable rooms need a reason and show
// in the owner's daily report (brick 16 reads `liveProperty` on the audit events).
import { ORPCError } from '@orpc/server'
import type { RoomsProperty } from './context.ts'

export function isLive(property: Pick<RoomsProperty, 'liveSince'>): boolean {
  return property.liveSince !== null
}

// Archive, restore and type changes on a live property. Before go-live nobody is asked.
export function requireReasonIfLive(property: RoomsProperty, reason: string | undefined): void {
  if (isLive(property) && !reason) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Give a reason. ${property.name} is live, so this shows in the owner's daily report.`,
      data: { code: 'REASON_REQUIRED' },
    })
  }
}
