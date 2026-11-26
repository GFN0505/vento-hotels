// "View as a role": owners and group admins preview the app as a front desk agent, a waiter or a
// GM would see it — the menu, the pages and what's hidden. It's a preview only: the API still uses
// the viewer's real access for anything they do. Kept for this browser tab (sessionStorage).
import { MEMBER_ROLES, type MemberRole } from '@vento/shared'
import { createContext, type ReactNode, useContext, useState } from 'react'

const STORAGE_KEY = 'vento.viewAs'

type ViewAsState = {
  viewAs: MemberRole | undefined
  setViewAs: (role: MemberRole | undefined) => void
}

const ViewAsContext = createContext<ViewAsState>({ viewAs: undefined, setViewAs: () => {} })

function readStored(): MemberRole | undefined {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY)
    return MEMBER_ROLES.find((role) => role === value)
  } catch {
    return undefined
  }
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [viewAs, setState] = useState<MemberRole | undefined>(readStored)
  const setViewAs = (role: MemberRole | undefined) => {
    setState(role)
    try {
      if (role) sessionStorage.setItem(STORAGE_KEY, role)
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Private mode or blocked storage: the preview still works until the page reloads.
    }
  }
  return <ViewAsContext.Provider value={{ viewAs, setViewAs }}>{children}</ViewAsContext.Provider>
}

export function useViewAs() {
  return useContext(ViewAsContext)
}
