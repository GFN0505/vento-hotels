// The property the member is working in, chosen in the top bar and remembered on this device.
import type { Property } from '@vento/shared'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'vento.propertyId'

type PropertyState = {
  properties: Property[]
  current: Property | undefined
  select: (id: string) => void
}

const PropertyContext = createContext<PropertyState | undefined>(undefined)

function readStored(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function PropertyProvider({
  properties,
  children,
}: {
  properties: Property[]
  children: ReactNode
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(readStored)

  // Fall back to the first property if the remembered one is gone or not accessible.
  const current = properties.find((p) => p.id === selectedId) ?? properties[0]

  useEffect(() => {
    if (!current) return
    try {
      localStorage.setItem(STORAGE_KEY, current.id)
    } catch {
      // Storage can be blocked; the choice then lasts for this visit only.
    }
  }, [current])

  const value = useMemo(
    () => ({ properties, current, select: setSelectedId }),
    [properties, current],
  )
  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
}

export function useProperty(): PropertyState {
  const value = useContext(PropertyContext)
  if (!value) throw new Error('useProperty must be used inside PropertyProvider')
  return value
}
