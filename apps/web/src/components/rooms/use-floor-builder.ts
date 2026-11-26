// State for "Add rooms by floor": new room types, the floor lines, chip changes in the preview,
// and which planned numbers the hotel already has (asked of the API as the lines change).
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { MAX_ROOMS_PER_BATCH, type RoomTypeView, suggestCode } from '@vento/shared'
import { useEffect, useMemo, useState } from 'react'
import { orpc } from '@/lib/api'
import {
  checkDraft,
  checkLine,
  type DraftType,
  type Line,
  plan,
  type TypeOption,
} from './builder-model'

let counter = 0
const key = () => `draft-${++counter}`

const newDraft = (): DraftType => ({
  key: key(),
  name: '',
  code: '',
  codeEdited: false,
  bed: 'king',
  sofaBed: false,
  guests: '2',
})

const newLine = (typeKey: string, floor = '1'): Line => ({
  key: key(),
  typeKey,
  floorFrom: floor,
  floorTo: floor,
  numberFrom: '01',
  numberTo: '10',
})

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function useFloorBuilder({
  propertyId,
  types,
  hotelHasRooms,
}: {
  propertyId: string
  // Every room type of the hotel, archived included (codes stay taken).
  types: readonly RoomTypeView[]
  hotelHasRooms: boolean
}) {
  const active = types.filter((type) => !type.archivedAt)
  // A brand-new hotel starts with one type to name and one line already pointing at it.
  const [drafts, setDrafts] = useState<DraftType[]>(() => (active.length ? [] : [newDraft()]))
  const [lines, setLines] = useState<Line[]>(() => [newLine(active[0]?.id ?? drafts[0]?.key ?? '')])
  const [overrides, setOverrides] = useState<Map<string, string | null>>(() => new Map())
  const [touched, setTouched] = useState(false)

  const options: TypeOption[] = [
    ...active.map((type, index) => ({
      key: type.id,
      name: type.name,
      toneIndex: index,
      saved: true,
    })),
    ...drafts.map((draft, index) => ({
      key: draft.key,
      name: draft.name.trim() || `New type ${index + 1}`,
      toneIndex: active.length + index,
      saved: false,
    })),
  ]
  const draftChecks = new Map(
    drafts.map((draft) => [
      draft.key,
      checkDraft(
        draft,
        types,
        drafts.filter((other) => other.key !== draft.key),
      ),
    ]),
  )
  const lineChecks = new Map(lines.map((line) => [line.key, checkLine(line)]))
  const values = lines.flatMap((line) => lineChecks.get(line.key)?.value ?? [])

  // Ask which numbers exist only when the hotel has rooms, after typing pauses.
  // Compared as text, so the same numbers never count as a change.
  const numbersKey = plan(values, new Map(), new Map())
    .chips.slice(0, MAX_ROOMS_PER_BATCH)
    .map((chip) => chip.number)
    .join(' ')
  const askedKey = useDebounced(numbersKey, 300)
  const asked = useMemo(() => (askedKey ? [...new Set(askedKey.split(' '))] : []), [askedKey])
  const taken = useQuery({
    ...orpc.rooms.checkNumbers.queryOptions({ input: { propertyId, numbers: asked } }),
    enabled: hotelHasRooms && asked.length > 0,
    placeholderData: keepPreviousData,
  })
  const takenMap = new Map((taken.data?.taken ?? []).map((t) => [t.number, t.archived]))
  const preview = plan(values, overrides, takenMap)

  const usedKeys = new Set(preview.toCreate.map((chip) => chip.typeKey))
  const draftProblems = drafts.some((draft) => {
    const check = draftChecks.get(draft.key)
    const needed = usedKeys.has(draft.key) || draft.name.trim() !== ''
    return needed && (check?.name || check?.code || check?.guests)
  })
  const lineProblems = [...lineChecks.values()].some((c) => c.type || c.floors || c.numbers)
  // What's stopping Create, in a line, for the bar beside the button.
  const unnamed = drafts.findIndex((d) => usedKeys.has(d.key) && !d.name.trim())
  const blocker =
    unnamed >= 0
      ? `Name new type ${unnamed + 1} to create its rooms.`
      : draftProblems
        ? 'Fix the room types above.'
        : lineProblems
          ? 'Fix the lines above.'
          : undefined

  return {
    drafts,
    lines,
    options,
    draftChecks,
    lineChecks,
    preview,
    overrides,
    checkingNumbers: taken.isFetching,
    blocker,
    touched,
    ready:
      preview.toCreate.length > 0 &&
      preview.duplicates.length === 0 &&
      !preview.tooMany &&
      !draftProblems &&
      !lineProblems,
    addDraft: () => {
      setTouched(true)
      setDrafts((list) => [...list, newDraft()])
    },
    updateDraft: (draftKey: string, change: Partial<DraftType>) => {
      setTouched(true)
      setDrafts((list) =>
        list.map((draft) => {
          if (draft.key !== draftKey) return draft
          const next = { ...draft, ...change }
          if (change.code !== undefined) next.codeEdited = change.code.trim() !== ''
          if (change.name !== undefined && !next.codeEdited) next.code = suggestCode(change.name)
          return next
        }),
      )
    },
    removeDraft: (draftKey: string) => {
      setDrafts((list) => list.filter((draft) => draft.key !== draftKey))
      setLines((list) => list.map((l) => (l.typeKey === draftKey ? { ...l, typeKey: '' } : l)))
      setOverrides((map) => new Map([...map].filter(([, typeKey]) => typeKey !== draftKey)))
    },
    addLine: () => {
      setTouched(true)
      const last = lines.at(-1)
      const nextFloor = last ? String((Number.parseInt(last.floorTo, 10) || 0) + 1) : '1'
      setLines((list) => [...list, newLine(options.at(-1)?.key ?? '', nextFloor)])
    },
    updateLine: (lineKey: string, change: Partial<Line>) => {
      setTouched(true)
      setLines((list) => list.map((line) => (line.key === lineKey ? { ...line, ...change } : line)))
    },
    removeLine: (lineKey: string) =>
      setLines((list) => list.filter((line) => line.key !== lineKey)),
    setChip: (number: string, typeKey: string | null | undefined) =>
      setOverrides((map) => {
        const next = new Map(map)
        if (typeKey === undefined) next.delete(number)
        else next.set(number, typeKey)
        return next
      }),
    // After new types are saved, lines and chips point at their real ids.
    typesSaved: (saved: ReadonlyMap<string, string>) => {
      setDrafts((list) => list.filter((draft) => !saved.has(draft.key)))
      setLines((list) => list.map((l) => ({ ...l, typeKey: saved.get(l.typeKey) ?? l.typeKey })))
      setOverrides((map) => {
        const next = new Map<string, string | null>()
        for (const [n, t] of map) next.set(n, t === null ? null : (saved.get(t) ?? t))
        return next
      })
    },
  }
}

export type FloorBuilderState = ReturnType<typeof useFloorBuilder>
