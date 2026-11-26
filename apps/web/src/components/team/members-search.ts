// What Members and roles keeps in the URL. The hotel isn't here: it's the top-bar switch.
import type { RoleFilter } from '@vento/shared'

export type MembersSearch = {
  q?: string | undefined
  filter?: RoleFilter | undefined
  page?: number | undefined
  // Opens the invite limited to this hotel (a new hotel's "Invite the team").
  invite?: string | undefined
}

export type OnMembersSearch = (patch: Partial<MembersSearch>) => void

export const MEMBERS_PAGE_SIZE = 25
