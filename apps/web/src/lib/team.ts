// Small helpers for the team screens: how hotels, dates and limits read on screen.
import type { LimitKind, MemberRole } from '@vento/shared'
import { MEMBER_ROLES, ROLE_INFO } from '@vento/shared'

export function hotelsSummary(allProperties: boolean, hotels: { name: string }[]): string {
  if (allProperties) return 'Whole group'
  if (hotels.length === 0) return 'No hotels yet'
  if (hotels.length <= 2) return hotels.map((h) => h.name).join(', ')
  return `${hotels[0]?.name}, ${hotels[1]?.name} +${hotels.length - 2}`
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

// "≤10%" or "≤₦100k", as in the permissions grid (design #26).
export function formatLimit(kind: LimitKind | null, limit: string | null): string {
  if (limit === null) return ''
  const value = Number(limit)
  if (kind === 'percent') return `≤${trim(value)}%`
  if (value >= 1_000_000) return `≤₦${trim(value / 1_000_000)}m`
  if (value >= 1_000) return `≤₦${trim(value / 1_000)}k`
  return `≤₦${trim(value)}`
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

// Roles a person may hand out: only owners create owners and group admins (the API checks too).
export function assignableRoles(myRole: MemberRole | undefined): MemberRole[] {
  return MEMBER_ROLES.filter(
    (role) => myRole === 'owner' || (role !== 'owner' && role !== 'group_admin'),
  )
}

export const roleOptions = (roles: MemberRole[]) =>
  roles.map((role) => ({ value: role, label: ROLE_INFO[role].label }))

// Splits what someone typed or pasted ("a@x.ng, b@y.ng\nc@z.ng") into emails.
export function splitEmails(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}
