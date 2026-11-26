// The permissions matrix from docs/DOMAIN.md, as data. These are the seed defaults; an organization
// can override any role × permission (allowed and limit) through `permissions.set`.
// Keep this file and the DOMAIN.md table in step.
import { z } from 'zod'
import type { MemberRole } from './roles.ts'

// What a limit measures. `percent` is a discount or override %, `amount_ngn` a naira amount.
export type LimitKind = 'percent' | 'amount_ngn'

type PermissionDefinition = {
  label: string
  limit?: LimitKind
}

export const PERMISSIONS = {
  // Setup (Stage 0)
  'setup.manage': { label: 'Manage companies, properties, people and their access' },
  // Rooms have their own row so a GM can set them up without managing people (spec, decision 1).
  'rooms.setup': { label: 'Set up room types and rooms' },
  // GMs change their hotels' times without managing people or companies (hotels spec, question 1).
  'property.operating_times': { label: "Edit a hotel's check-in and check-out times" },
  // Finance sets these up without managing people (taxes and payments spec, decision 5).
  'finance.setup': { label: 'Set up taxes, payment methods, bank accounts and POS terminals' },
  'permissions.manage': { label: 'Change permissions or limits' },
  'audit.view': { label: 'View the audit log' },
  // Front office
  'reservation.manage': { label: 'Create / modify reservation' },
  'stay.rate_override': { label: 'Rate override / discount on a stay', limit: 'percent' },
  'penalty.waive': { label: 'Waive cancellation / no-show penalty' },
  'room.move': { label: 'Room move (before audit)' },
  'folio.void_own_same_day': { label: 'Void own folio posting, same business date' },
  'folio.void_same_day': { label: 'Void any folio posting, same business date' },
  'folio.correct_after_audit': { label: 'Correct folio posting after night audit' },
  refund: { label: 'Refund', limit: 'amount_ngn' },
  'room_night.comp': { label: 'Comp room night' },
  'city_ledger.settle': { label: 'Settle to city ledger (within credit limit)' },
  'credit_limit.exceed': { label: "Exceed a corporate account's credit limit" },
  'cashier_shift.operate': { label: 'Open / close cashier shift' },
  'rates.edit': { label: 'Edit rates and restrictions' },
  'night_audit.run': { label: 'Run night audit' },
  // Restaurant & bar
  'pos.post_to_room': { label: 'Post POS bill to a room' },
  'pos.void_before_send': { label: 'POS void before ticket sent' },
  'pos.void_after_send': { label: 'POS void after ticket sent / comp item' },
  'pos.discount': { label: 'POS discount on a bill', limit: 'percent' },
  'pos.reopen_bill': { label: 'Reopen a closed POS bill' },
  // Back office and owner
  'fx.enter': { label: 'Enter FX rates' },
  'payroll.approve': { label: 'Approve payroll run' },
  'leakage.view': { label: "View owner's daily report and leakage alerts" },
} as const satisfies Record<string, PermissionDefinition>

export type Permission = keyof typeof PERMISSIONS

// How the permissions grid groups rows (design #26).
export const PERMISSION_GROUPS: readonly { label: string; permissions: readonly Permission[] }[] = [
  {
    label: 'Setup',
    permissions: [
      'setup.manage',
      'rooms.setup',
      'property.operating_times',
      'finance.setup',
      'permissions.manage',
      'audit.view',
    ],
  },
  {
    label: 'Front office',
    permissions: [
      'reservation.manage',
      'stay.rate_override',
      'penalty.waive',
      'room.move',
      'folio.void_own_same_day',
      'folio.void_same_day',
      'folio.correct_after_audit',
      'refund',
      'room_night.comp',
      'city_ledger.settle',
      'credit_limit.exceed',
      'cashier_shift.operate',
      'rates.edit',
      'night_audit.run',
    ],
  },
  {
    label: 'Restaurant & bar',
    permissions: [
      'pos.post_to_room',
      'pos.void_before_send',
      'pos.void_after_send',
      'pos.discount',
      'pos.reopen_bill',
    ],
  },
  { label: 'Back office', permissions: ['fx.enter', 'payroll.approve', 'leakage.view'] },
]
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[]
export const permissionSchema = z.enum(PERMISSION_KEYS as [Permission, ...Permission[]])

export function limitKindOf(permission: Permission): LimitKind | undefined {
  const definition: PermissionDefinition = PERMISSIONS[permission]
  return definition.limit
}

// A rule for one role and permission. `limit` is a decimal string (e.g. "10" for 10%,
// "100000" for ₦100,000); null means no limit. Only permissions with a limit kind use it.
export type PermissionRule = { allowed: boolean; limit: string | null }

const yes: PermissionRule = { allowed: true, limit: null }
const upTo = (limit: string): PermissionRule => ({ allowed: true, limit })

type RoleDefaults = Partial<Record<Permission, PermissionRule>>

const ownerAll = Object.fromEntries(PERMISSION_KEYS.map((key) => [key, yes])) as RoleDefaults
// Changing permissions stays with the owner alone, so an admin can't widen their own access.
const groupAdminAll = Object.fromEntries(
  PERMISSION_KEYS.filter((key) => key !== 'permissions.manage').map((key) => [key, yes]),
) as RoleDefaults

// Anything missing is not allowed.
export const DEFAULT_MATRIX: Record<MemberRole, RoleDefaults> = {
  owner: ownerAll,
  group_admin: groupAdminAll,
  general_manager: {
    'rooms.setup': yes,
    'property.operating_times': yes,
    'audit.view': yes,
    'reservation.manage': yes,
    'stay.rate_override': upTo('50'),
    'penalty.waive': yes,
    'room.move': yes,
    'folio.void_own_same_day': yes,
    'folio.void_same_day': yes,
    refund: upTo('100000'),
    'room_night.comp': yes,
    'city_ledger.settle': yes,
    'credit_limit.exceed': yes,
    'cashier_shift.operate': yes,
    'rates.edit': yes,
    'night_audit.run': yes,
    'fx.enter': yes,
    'pos.post_to_room': yes,
    'pos.void_before_send': yes,
    'pos.void_after_send': yes,
    'pos.discount': upTo('50'),
    'pos.reopen_bill': yes,
    'leakage.view': yes,
  },
  revenue_manager: {
    'reservation.manage': yes,
    'stay.rate_override': upTo('25'),
    'penalty.waive': yes,
    'room.move': yes,
    'rates.edit': yes,
  },
  front_desk: {
    'reservation.manage': yes,
    'stay.rate_override': upTo('10'),
    'room.move': yes,
    'folio.void_own_same_day': yes,
    'city_ledger.settle': yes,
    'cashier_shift.operate': yes,
    // Only for night-shift front desk; the shift check arrives with rosters.
    'night_audit.run': yes,
  },
  finance: {
    'finance.setup': yes,
    'fx.enter': yes,
    'audit.view': yes,
    'folio.void_own_same_day': yes,
    'folio.void_same_day': yes,
    'folio.correct_after_audit': yes,
    refund: yes,
    'city_ledger.settle': yes,
    'credit_limit.exceed': yes,
    'cashier_shift.operate': yes,
    'night_audit.run': yes,
    'payroll.approve': yes,
    'leakage.view': yes,
  },
  cashier: {
    'pos.post_to_room': yes,
    'pos.void_before_send': yes,
    'pos.discount': upTo('5'),
    'cashier_shift.operate': yes,
  },
  waiter: {
    'pos.post_to_room': yes,
    'pos.void_before_send': yes,
  },
  fnb_manager: {
    'pos.post_to_room': yes,
    'pos.void_before_send': yes,
    'pos.void_after_send': yes,
    'pos.discount': upTo('20'),
    'pos.reopen_bill': yes,
    'cashier_shift.operate': yes,
  },
  // Their own modules' permissions arrive with those modules.
  sales: {},
  housekeeping_supervisor: {},
  room_attendant: {},
  maintenance: {},
  storekeeper: {},
  hr: {},
  viewer: {},
}

export function defaultRule(role: MemberRole, permission: Permission): PermissionRule {
  return DEFAULT_MATRIX[role][permission] ?? { allowed: false, limit: null }
}
