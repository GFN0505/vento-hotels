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
