// The hotel the member is working in, chosen in the top bar and remembered on this device.
// People who see the whole group can also choose "All hotels": Home then shows the group, and
// `current` stays the last hotel picked, for pages that always work in one hotel.
import type { Property } from '@vento/shared'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

const STORAGE_KEY = 'vento.propertyId'
const ALL = 'all'
const LAST_HOTEL_KEY = 'vento.lastPropertyId'

type PropertyState = {
  properties: Property[]
  current: Property | undefined
  // "All hotels" is chosen (only possible for people who see the whole group).
  allHotels: boolean
  canSeeAll: boolean
  select: (id: string) => void
  selectAll: () => void
}

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
  children,
}: {
  properties: Property[]
  // The member sees every hotel in the group (owners, group admins, group finance).
  groupWide: boolean
  children: ReactNode
}) {
  // Group-wide people start on the whole group; everyone else on their first hotel.
  const [selectedId, setSelectedId] = useState<string | undefined>(() => read(STORAGE_KEY))
  const canSeeAll = groupWide && properties.length > 1
  const allHotels = canSeeAll && (selectedId ?? ALL) === ALL
  const lastHotel = selectedId && selectedId !== ALL ? selectedId : read(LAST_HOTEL_KEY)

  // Fall back to the first property if the remembered one is gone or not accessible.
  const current = properties.find((p) => p.id === lastHotel) ?? properties[0]

  // Saved only when someone chooses, so a role preview never overwrites the owner's choice.
  const value = useMemo(
    () => ({
      properties,
      current,
      allHotels,
      canSeeAll,
      select: (id: string) => {
        setSelectedId(id)
        write(STORAGE_KEY, id)
        write(LAST_HOTEL_KEY, id)
      },
      selectAll: () => {
        setSelectedId(ALL)
        write(STORAGE_KEY, ALL)
      },
    }),
    [properties, current, allHotels, canSeeAll],
  )
  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
}

export function useProperty(): PropertyState {
  const value = useContext(PropertyContext)
  if (!value) throw new Error('useProperty must be used inside PropertyProvider')
  return value
}
