// Room types (design: RoomsRates view=rooms): name, rooms (counted from the rooms, never typed),
// bed, max guests and size, in the order every picker and the tape chart use. Drag a row on a
// desktop, or use Move up / Move down (also the keyboard way).
import { useMutation } from '@tanstack/react-query'
import type { RoomTypeView } from '@vento/shared'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { problemMessage } from '@/lib/errors'
import { ArchivedTypes } from './archived-types'
import { bedLabel, plural, toneAt, toneIndexes } from './format'
import { useRoomsRefresh } from './queries'

type Props = {
  propertyId: string
  types: readonly RoomTypeView[]
  archived: readonly RoomTypeView[]
  canWrite: boolean
  onEdit: (id: string) => void
}

export function RoomTypesCard({ propertyId, types, archived, canWrite, onEdit }: Props) {
  const refresh = useRoomsRefresh()
  const [order, setOrder] = useState<string[]>()
  const [dragging, setDragging] = useState<string>()
  const [expanded, setExpanded] = useState(false)
  const byId = new Map(types.map((type) => [type.id, type]))
  const ordered = (order ?? types.map((t) => t.id)).flatMap((id) => byId.get(id) ?? [])

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.roomTypes.reorder({ propertyId, ids }),
    onSettled: async () => {
      await refresh()
      setOrder(undefined)
    },
    onError: (error) => toast.error(problemMessage(error)),
  })

  function move(id: string, to: number) {
    const ids = ordered.map((t) => t.id).filter((x) => x !== id)
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id)
    setOrder(ids)
    reorder.mutate(ids)
  }

  const tones = toneIndexes([...types, ...archived])
  return (
    <Card className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-md font-semibold">
          Room types
          <span className="num font-normal text-text-3 md:hidden"> · {types.length}</span>
        </h2>
        <span className="text-sm text-text-3 max-md:hidden">
          Pickers and the tape chart follow this order
        </span>
        {/* Phones fold the types away; rooms are what people come here for most. */}
        <Button
          size="sm"
          variant="ghost"
          className="h-11 md:hidden"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide' : `Show ${plural(types.length, 'type')}`}
        </Button>
      </header>
      <table
        className={cn(
          'w-full border-collapse text-left max-md:block',
          !expanded && 'max-md:hidden',
        )}
      >
        <thead className="max-md:sr-only">
          <tr className="border-b border-border bg-surface-2/50 text-xs font-medium text-text-3">
            <th scope="col" className="w-10 py-2 pl-3">
              <span className="sr-only">Order</span>
            </th>
            <th scope="col" className="px-3 py-2">
              Room type
            </th>
            <th scope="col" className="w-20 px-3 py-2 text-right">
              Rooms
            </th>
            <th scope="col" className="px-3 py-2">
              Bed
            </th>
            <th scope="col" className="px-3 py-2">
              Max guests
            </th>
            <th scope="col" className="px-3 py-2">
              Size
            </th>
            <th scope="col" className="w-40 px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border max-md:block">
          {ordered.map((type, index) => (
            <tr
              key={type.id}
              draggable={canWrite}
              onDragStart={() => setDragging(type.id)}
              onDragEnd={() => setDragging(undefined)}
              onDragOver={(event) => {
                if (dragging && dragging !== type.id) event.preventDefault()
              }}
              onDrop={() => dragging && move(dragging, index)}
              className={cn(
                'transition-colors max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:px-4 max-md:py-3',
                dragging === type.id && 'opacity-50',
                dragging && dragging !== type.id && 'hover:bg-pri-soft/40',
              )}
            >
              <td className="py-2.5 pl-3 max-md:hidden">
                <GripVertical
                  className={cn('size-4 text-text-3', canWrite ? 'cursor-grab' : 'opacity-0')}
                  aria-hidden="true"
                />
              </td>
              <td className="px-3 py-2.5 max-md:p-0">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2.5 flex-none rounded-[3px]',
                      toneAt(tones.get(type.id) ?? 0).swatch,
                    )}
                  />
                  <span className="truncate font-medium" title={type.name}>
                    {type.name}
                  </span>
                  <span className="num text-xs text-text-3">{type.code}</span>
                </span>
              </td>
              <td className="num px-3 py-2.5 text-right font-medium max-md:col-start-1 max-md:p-0 max-md:pl-5 max-md:text-left max-md:font-normal max-md:text-text-2">
                {type.roomCount}
                <span className="md:sr-only"> rooms</span>
                <span className="text-text-2 md:hidden">
                  {' '}
                  · {bedLabel(type)} · {type.maxGuests} guests
                </span>
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-text-2 max-md:hidden">
                {bedLabel(type)}
              </td>
              <td className="num px-3 py-2.5 text-text-2 max-md:hidden">{type.maxGuests}</td>
              <td className="num px-3 py-2.5 whitespace-nowrap text-text-2 max-md:hidden">
                {type.sizeSqm ? (
                  `${Number(type.sizeSqm)} m²`
                ) : (
                  <span className="text-text-3">Not set</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right max-md:col-start-2 max-md:row-span-2 max-md:row-start-1 max-md:self-center max-md:p-0">
                <span className="inline-flex items-center gap-1">
                  {canWrite && ordered.length > 1 ? (
                    <span className="inline-flex">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${type.name} up`}
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(type.id, index - 1)}
                      >
                        <ChevronUp className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${type.name} down`}
                        disabled={index === ordered.length - 1 || reorder.isPending}
                        onClick={() => move(type.id, index + 1)}
                      >
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </Button>
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="max-lg:h-11"
                    aria-label={`Edit ${type.name}`}
                    onClick={() => onEdit(type.id)}
                  >
                    Edit
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {archived.length > 0 ? <ArchivedTypes types={archived} canWrite={canWrite} /> : null}
    </Card>
  )
}
