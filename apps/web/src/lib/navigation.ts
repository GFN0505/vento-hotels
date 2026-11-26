// The app's menu, as in the approved design (Shell components · Sidebar): every module, grouped,
// with the feature switch it ships behind (decision 0021) and the roles that use it day to day.
// Owners and group admins see everything. When a module's own permissions arrive, its entry moves
// from `roles` to its permission keys; the API is what enforces access, not this list.
import type { Feature, MemberRole } from '@vento/shared'
import {
  BedDouble,
  CalendarDays,
  ChartColumn,
  ChartGantt,
  House,
  IdCard,
  Landmark,
  type LucideIcon,
  Package,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react'

export type ModulePath =
  | '/reservations'
  | '/tape-chart'
  | '/front-desk'
  | '/guests'
  | '/rates'
  | '/housekeeping'
  | '/maintenance'
  | '/restaurant'
  | '/stores'
  | '/finance'
  | '/hr'
  | '/analytics'
  | '/leakage'

export type ModuleEntry = {
  to: ModulePath
  label: string
  icon: LucideIcon
  feature: Feature
  // Roles besides owner and group admin who use it.
  roles: readonly MemberRole[]
  // Release-plan stage that builds it (docs/PRODUCT.md), shown until it ships.
  stage: number
  // One line on what it's for, shown on the page until it ships.
  about: string
}

export type NavGroup = { label?: string; entries: readonly ModuleEntry[] }

const FRONT_DESK_TEAM: readonly MemberRole[] = ['general_manager', 'front_desk']

export const MODULES: readonly NavGroup[] = [
  {
    label: 'Front office',
    entries: [
      {
        to: '/reservations',
        label: 'Reservations',
        icon: CalendarDays,
        feature: 'front_desk',
        roles: [...FRONT_DESK_TEAM, 'revenue_manager', 'sales'],
        stage: 1,
        about: 'Every booking in one list: new, modify, cancel, no-show, deposits.',
      },
      {
        to: '/tape-chart',
        label: 'Tape chart',
        icon: ChartGantt,
        feature: 'front_desk',
        roles: [...FRONT_DESK_TEAM, 'revenue_manager'],
        stage: 1,
        about: 'Rooms by night at a glance: drag to move a stay, see what sells.',
      },
      {
        to: '/front-desk',
        label: 'Front desk',
        icon: BedDouble,
        feature: 'front_desk',
        roles: FRONT_DESK_TEAM,
        stage: 1,
        about: "Today's arrivals and departures, check-in, walk-ins, folios and cashier shifts.",
      },
      {
        to: '/guests',
        label: 'Guests & sales',
        icon: Users,
        feature: 'guests_sales',
        roles: [...FRONT_DESK_TEAM, 'sales', 'revenue_manager'],
        stage: 4,
        about: 'Guest profiles, companies with credit, travel agents, groups and events.',
      },
    ],
  },
  {
    label: 'Revenue',
    entries: [
      {
        to: '/rates',
        label: 'Rates & channels',
        icon: Tag,
        feature: 'booking_engine',
        roles: ['general_manager', 'revenue_manager'],
        stage: 4,
        about: 'Rate plans, restrictions, your booking engine and the OTAs, in one place.',
      },
    ],
  },
  {
    label: 'Operations',
    entries: [
      {
        to: '/housekeeping',
        label: 'Housekeeping',
        icon: Sparkles,
        feature: 'housekeeping',
        roles: ['general_manager', 'housekeeping_supervisor', 'room_attendant', 'front_desk'],
        stage: 2,
        about: 'Room status board, attendant assignments, inspections and minibar.',
      },
      {
        to: '/maintenance',
        label: 'Maintenance',
        icon: Wrench,
        feature: 'housekeeping',
        roles: ['general_manager', 'maintenance', 'housekeeping_supervisor'],
        stage: 2,
        about: 'Work orders, out-of-order rooms, and the power and diesel log.',
      },
      {
        to: '/restaurant',
        label: 'Restaurant & bar',
        icon: UtensilsCrossed,
        feature: 'restaurant_pos',
        roles: ['general_manager', 'fnb_manager', 'cashier', 'waiter'],
        stage: 3,
        about: 'Orders, kitchen tickets, bills to rooms, voids and comps, even offline.',
      },
      {
        to: '/stores',
        label: 'Stores',
        icon: Package,
        feature: 'inventory',
        roles: ['general_manager', 'storekeeper', 'fnb_manager', 'finance'],
        stage: 5,
        about: 'Stock, requisitions, purchase orders, receiving and counts.',
      },
    ],
  },
  {
    label: 'Back office',
    entries: [
      {
        to: '/finance',
        label: 'Finance',
        icon: Landmark,
        feature: 'finance',
        roles: ['general_manager', 'finance'],
        stage: 5,
        about: 'City ledger, the books per company, reconciliation and taxes.',
      },
      {
        to: '/hr',
        label: 'HR & payroll',
        icon: IdCard,
        feature: 'hr_payroll',
        roles: ['general_manager', 'hr', 'finance'],
        stage: 5,
        about: 'Staff records, rosters, attendance, leave and payroll.',
      },
      {
        to: '/analytics',
        label: 'Analytics',
        icon: ChartColumn,
        feature: 'analytics',
        roles: ['general_manager', 'revenue_manager', 'finance', 'viewer'],
        stage: 6,
        about: 'Occupancy, ADR, RevPAR and the group at a glance, with board packs.',
      },
      {
        to: '/leakage',
        label: 'Leakage',
        icon: ShieldCheck,
        feature: 'front_desk',
        roles: ['general_manager', 'finance'],
        stage: 1,
        about: "The owner's daily report: voids, discounts, comps and anything unusual, by name.",
      },
    ],
  },
]

export const HOME_ENTRY = { to: '/' as const, label: 'Home', icon: House }

export const ALL_MODULES: readonly ModuleEntry[] = MODULES.flatMap((group) => group.entries)

export function findModule(path: string): ModuleEntry | undefined {
  return ALL_MODULES.find((entry) => entry.to === path)
}

// Whether this role uses the entry. Owners and group admins see every module.
export function roleSees(role: MemberRole, entry: ModuleEntry): boolean {
  return role === 'owner' || role === 'group_admin' || entry.roles.includes(role)
}

// The menu for a role and the modules switched on for the group.
export function visibleGroups(role: MemberRole, has: (feature: Feature) => boolean): NavGroup[] {
  return MODULES.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => has(entry.feature) && roleSees(role, entry)),
  })).filter((group) => group.entries.length > 0)
}
