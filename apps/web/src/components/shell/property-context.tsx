// The hotel switch (spec: stage-1-hotel-switch-scope.md): the hotel the member is working in, chosen
// in the top bar and remembered on this browser. People who see the whole group can also choose
// "All hotels". Pages read `scope` to decide what to load; `current` (the last hotel picked) is only
// a default for hotel pages and forms, never a filter while All hotels is chosen.
import type { Property } from '@vento/shared'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { ALL_HOTELS, type Scope } from '@/lib/scope'

const STORAGE_KEY = 'vento.propertyId'
const LAST_HOTEL_KEY = 'vento.lastPropertyId'

type PropertyState = {
  properties: Property[]
  current: Property | undefined
  // "All hotels" is chosen (only possible for people who see the whole group).
  allHotels: boolean
  canSeeAll: boolean
  // What pages show; undefined until the hotels have loaded (or when the member has none).
  scope: Scope | undefined
  // The hotels and the member's access have loaded.
  ready: boolean
  select: (id: string) => void
  selectAll: () => void
  // A page with unsaved changes asks before the hotel changes under it (useLeaveGuard).
  setLeaveGuard: (guard: LeaveGuard | undefined) => void
}

// Runs `proceed` now, or once the person has agreed to leave.
export type LeaveGuard = (proceed: () => void) => void

const PropertyContext = createContext<PropertyState | undefined>(undefined)

function read(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}

export function PropertyProvider({
  properties,
  groupWide,
  previewing = false,
  ready = true,
  children,
}: {
  properties: Property[]
  // The member sees every hotel in the group (owners, group admins, group finance).
  groupWide: boolean
  // A role preview: choices last for the preview and never overwrite the owner's own.
  previewing?: boolean
  // The hotels and the member's access have loaded, so the scope won't flip from one hotel to All
  // hotels a moment later (and load the wrong list first).
  ready?: boolean
  children: ReactNode
}) {
  // Each tab keeps its own choice once open; a new tab starts on the last one chosen anywhere.
  const [selectedId, setSelectedId] = useState<string | undefined>(() => read(STORAGE_KEY))
  const canSeeAll = groupWide && properties.length > 1
  const allHotels = canSeeAll && (selectedId ?? ALL_HOTELS) === ALL_HOTELS
  const lastHotel = selectedId && selectedId !== ALL_HOTELS ? selectedId : read(LAST_HOTEL_KEY)

  // Fall back to the first property if the remembered one is gone or not accessible.
  const current = properties.find((p) => p.id === lastHotel) ?? properties[0]

  const guard = useRef<LeaveGuard | undefined>(undefined)
  const guarded = (change: () => void) => (guard.current ? guard.current(change) : change())
  const remember = (id: string) => {
    if (previewing) return
    write(STORAGE_KEY, id)
    if (id !== ALL_HOTELS) write(LAST_HOTEL_KEY, id)
  }

  useLostHotel({ properties, selectedId, onFallback: setSelectedId, remember })

  // biome-ignore lint/correctness/useExhaustiveDependencies: `guarded` reads a ref; `remember` only `previewing`.
  const value = useMemo(
    () => ({
      properties,
      current,
      allHotels,
      canSeeAll,
      ready,
      scope: !ready
        ? undefined
        : allHotels
          ? ({ kind: 'all' } as const)
          : current
            ? ({ kind: 'hotel', hotel: current } as const)
            : undefined,
      select: (id: string) =>
        guarded(() => {
          setSelectedId(id)
          remember(id)
        }),
      selectAll: () =>
        guarded(() => {
          setSelectedId(ALL_HOTELS)
          remember(ALL_HOTELS)
        }),
      setLeaveGuard: (next: LeaveGuard | undefined) => {
        guard.current = next
      },
    }),
    [properties, current, allHotels, canSeeAll, previewing, ready],
  )
  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
}

// The chosen hotel left the list (access removed, or archived by someone else): fall back to the
// first hotel and say so, instead of quietly showing another one.
function useLostHotel({
  properties,
  selectedId,
  onFallback,
  remember,
}: {
  properties: Property[]
  selectedId: string | undefined
  onFallback: (id: string) => void
  remember: (id: string) => void
}) {
  const seen = useRef<Property[]>([])
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the hotel list changes only.
  useEffect(() => {
    const before = seen.current
    seen.current = properties
    const next = properties[0]
    if (before.length === 0 || !next || !selectedId || selectedId === ALL_HOTELS) return
    if (properties.some((p) => p.id === selectedId)) return
    const lost = before.find((p) => p.id === selectedId)
    if (!lost) return
    onFallback(next.id)
    remember(next.id)
    toast.info(`You no longer have access to ${lost.name}. Showing ${next.name}.`)
  }, [properties])
}

export function useProperty(): PropertyState {
  const value = useContext(PropertyContext)
  if (!value) throw new Error('useProperty must be used inside PropertyProvider')
  return value
}

// For shared pieces that also render outside the signed-in shell (e.g. PageHeader).
export function useOptionalProperty(): PropertyState | undefined {
  return useContext(PropertyContext)
}

// The page's scope: one hotel or All hotels; undefined while the hotels load.
export function useScope(): Scope | undefined {
  return useProperty().scope
}

// While `guard` is set, choosing another hotel in the top bar asks the page first.
export function useLeaveGuard(guard: LeaveGuard | undefined) {
  const { setLeaveGuard } = useProperty()
  useEffect(() => {
    setLeaveGuard(guard)
    return () => setLeaveGuard(undefined)
  }, [guard, setLeaveGuard])
}
