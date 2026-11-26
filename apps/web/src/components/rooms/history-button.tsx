// "Audit trail" in a room's sheet, for people who may see the audit log.
import { History } from 'lucide-react'
import { useState } from 'react'
import { useMe } from '@/lib/me'
import { RoomHistory } from './room-history'

export function HistoryButton({ roomId, title }: { roomId: string; title: string }) {
  const me = useMe()
  const [open, setOpen] = useState(false)
  if (!me.can('audit.view')) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 font-medium text-pri-ink hover:underline lg:min-h-0"
      >
        <History className="size-3.5" aria-hidden="true" />
        Audit trail
      </button>
      {open ? <RoomHistory roomId={roomId} title={title} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
