// A room's audit trail (design: AuditOnRoom): every change to it, newest first, with who, when,
// what changed and the reason. Only for people who may see the audit log (audit.view).
import { AuditSheet } from '@/components/audit/audit-sheet'
import { describe } from './history-format'

type Props = { roomId: string; title: string; onClose: () => void }

export function RoomHistory({ roomId, title, onClose }: Props) {
  return (
    <AuditSheet
      entityType="room"
      entityId={roomId}
      title={title}
      describe={describe}
      empty="Nothing recorded for this room yet."
      onClose={onClose}
    />
  )
}
