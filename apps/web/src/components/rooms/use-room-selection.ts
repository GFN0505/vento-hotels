// Which rooms are ticked in the table: one by one, the whole page, or every room in the view
// (from rooms.listIds, capped at the bulk limit). A new view clears it, with a quiet notice, so a
// bulk change never touches rooms out of sight.
import type { RoomFilters, RoomView } from '@vento/shared'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { problemMessage } from '@/lib/errors'

export type Picked = { id: string; number: string }

export function useRoomSelection(filters: RoomFilters, viewKey: string) {
  const [picked, setPicked] = useState<Map<string, string>>(() => new Map())
  // Set once "Select all N rooms in this view" has run: how many matched in all.
  const [viewTotal, setViewTotal] = useState<number>()
  const [notice, setNotice] = useState<string>()
  const [loading, setLoading] = useState(false)
  const lastView = useRef(viewKey)

  useEffect(() => {
    if (lastView.current === viewKey) return
    lastView.current = viewKey
    setViewTotal(undefined)
    setPicked((current) => {
      if (current.size > 0) setNotice('Selection cleared because the view changed.')
      return current.size > 0 ? new Map() : current
    })
  }, [viewKey])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(undefined), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  return {
    picked,
    refs: (): Picked[] => [...picked].map(([id, number]) => ({ id, number })),
    viewTotal,
    notice,
    loading,
    toggle: (room: RoomView, on: boolean) => {
      setViewTotal(undefined)
      setPicked((map) => {
        const next = new Map(map)
        if (on) next.set(room.id, room.number)
        else next.delete(room.id)
        return next
      })
    },
    togglePage: (rooms: readonly RoomView[], on: boolean) => {
      setViewTotal(undefined)
      setPicked(on ? new Map(rooms.map((r) => [r.id, r.number])) : new Map())
    },
    selectView: async (known: readonly RoomView[]) => {
      setLoading(true)
      try {
        const result = await api.rooms.listIds(filters)
        const numbers = new Map(known.map((r) => [r.id, r.number]))
        setPicked(new Map(result.ids.map((id) => [id, numbers.get(id) ?? ''])))
        setViewTotal(result.total)
      } catch (error) {
        setNotice(problemMessage(error))
      } finally {
        setLoading(false)
      }
    },
    clear: () => {
      setViewTotal(undefined)
      setPicked(new Map())
    },
  }
}
