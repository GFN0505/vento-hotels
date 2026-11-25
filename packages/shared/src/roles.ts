// Member roles from docs/DOMAIN.md ("Tenancy, properties and people"). What each role may do comes
// from the permissions matrix (brick 6); until then only group-level admins manage the setup.
import { z } from 'zod'

export const MEMBER_ROLES = [
  'owner',
  'group_admin',
  'general_manager',
  'revenue_manager',
  'front_desk',
  'sales',
  'fnb_manager',
  'cashier',
  'waiter',
  'housekeeping_supervisor',
  'room_attendant',
  'maintenance',
  'storekeeper',
  'finance',
  'hr',
  'viewer',
] as const

export const memberRoleSchema = z.enum(MEMBER_ROLES)
export type MemberRole = z.infer<typeof memberRoleSchema>

// Roles that always see every property and manage the group's setup.
export const GROUP_ADMIN_ROLES: readonly MemberRole[] = ['owner', 'group_admin']

export function isGroupAdmin(role: string): boolean {
  return (GROUP_ADMIN_ROLES as readonly string[]).includes(role)
}

// How each role is named on screen, its short code for the permissions grid (design #26), and one
// line on what it's for, shown when choosing a role. Limits come from Permissions and limits.
export const ROLE_INFO: Record<MemberRole, { label: string; code: string; summary: string }> = {
  owner: { label: 'Owner', code: 'OWN', summary: 'Everything, including who may do what.' },
  group_admin: {
    label: 'Group admin',
    code: 'ADM',
    summary: 'Runs the whole group and its people; only owners change permissions.',
  },
  general_manager: {
    label: 'General manager',
    code: 'GM',
    summary: 'Runs a hotel: front desk, restaurant, refunds and night audit, up to their limits.',
  },
  revenue_manager: {
    label: 'Revenue manager',
    code: 'REV',
    summary: 'Rates, restrictions and reservations, with rate overrides up to their limit.',
  },
  front_desk: {
    label: 'Front desk',
    code: 'FD',
    summary: 'Reservations, check-in and check-out, cashier shifts; discounts up to their limit.',
  },
  sales: { label: 'Sales', code: 'SAL', summary: 'Corporate accounts, groups and events.' },
  fnb_manager: {
    label: 'F&B manager',
    code: 'FBM',
    summary: 'Restaurant and bar: voids, reopened bills and discounts up to their limit.',
  },
  cashier: {
    label: 'Cashier',
    code: 'CSH',
    summary: 'Restaurant and bar bills and their cashier shift; small discounts.',
  },
  waiter: {
    label: 'Waiter / bartender',
    code: 'WTR',
    summary: 'Takes orders and posts bills to rooms.',
  },
  housekeeping_supervisor: {
    label: 'Housekeeping supervisor',
    code: 'HKS',
    summary: 'Room status, assignments and inspections.',
  },
  room_attendant: {
    label: 'Room attendant',
    code: 'RA',
    summary: 'Their rooms, room status and minibar.',
  },
  maintenance: {
    label: 'Maintenance',
    code: 'MNT',
    summary: 'Work orders and out-of-order rooms.',
  },
  storekeeper: {
    label: 'Storekeeper',
    code: 'STK',
    summary: 'Stores, receiving and stock counts.',
  },
  finance: {
    label: 'Finance',
    code: 'FIN',
    summary: 'Folios, refunds, corrections after audit, city ledger and payroll approval.',
  },
  hr: { label: 'HR', code: 'HR', summary: 'Staff records, rosters, attendance and leave.' },
  viewer: { label: 'Viewer', code: 'VIEW', summary: 'Can look, not change.' },
}

export function roleLabel(role: string): string {
  return ROLE_INFO[role as MemberRole]?.label ?? role
}

// Filters on the members list.
export const ROLE_FILTERS = {
  admins: ['owner', 'group_admin'],
  managers: [
    'general_manager',
    'revenue_manager',
    'fnb_manager',
    'housekeeping_supervisor',
    'finance',
    'hr',
  ],
  staff: [
    'front_desk',
    'sales',
    'cashier',
    'waiter',
    'room_attendant',
    'maintenance',
    'storekeeper',
    'viewer',
  ],
} as const satisfies Record<string, readonly MemberRole[]>
export type RoleFilter = keyof typeof ROLE_FILTERS
