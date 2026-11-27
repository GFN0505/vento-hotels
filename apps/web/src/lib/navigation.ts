// The app's menu, as in the approved design (Shell components · Sidebar): every module, grouped,
// with the feature switch it ships behind (decision 0021) and the roles that use it day to day.
// Owners and group admins see everything. When a module's own permissions arrive, its entry lists
// them in `needs`; the API is what enforces access, not this list.
import type { Feature, MemberRole, Permission } from '@vento/shared'
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
  // A few words for Home's workspace card.
  tagline: string
  icon: LucideIcon
  feature: Feature
  // Roles besides owner and group admin who use it.
  roles: readonly MemberRole[]
  // Once built: visible to anyone whose role has ANY of these permissions (instead of `roles`).
  needs?: readonly Permission[]
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
        tagline: 'Bookings, deposits and no-shows',
        label: 'Reservations',
        icon: CalendarDays,
        feature: 'front_desk',
        roles: [...FRONT_DESK_TEAM, 'revenue_manager', 'sales'],
        // Making bookings, or reading them (finance and the night auditor, read-only): the same
        // list as RESERVATION_READERS in @vento/shared, written out so the menu loads without it.
        needs: ['reservation.manage', 'night_audit.run', 'leakage.view'],
        stage: 1,
        about: 'Every booking in one list: new, modify, cancel, no-show, deposits.',
      },
      {
        to: '/tape-chart',
        tagline: 'Rooms by night at a glance',
        label: 'Tape chart',
        icon: ChartGantt,
        feature: 'front_desk',
        roles: [
          ...FRONT_DESK_TEAM,
          'revenue_manager',
          'housekeeping_supervisor',
          'room_attendant',
          'maintenance',
        ],
        // Reservation readers, and housekeeping and maintenance through their room permissions:
        // TAPE_CHART_READERS in @vento/shared, written out so the menu loads without it.
        needs: [
          'reservation.manage',
          'night_audit.run',
          'leakage.view',
          'room.status',
          'room.out_of_order',
        ],
        stage: 1,
        about: 'Rooms by night at a glance: drag to move a stay, see what sells.',
      },
      {
        to: '/front-desk',
        tagline: 'Arrivals, check-in and folios',
        label: 'Front desk',
        icon: BedDouble,
        feature: 'front_desk',
        roles: FRONT_DESK_TEAM,
        stage: 1,
        about: "Today's arrivals and departures, check-in, walk-ins, folios and cashier shifts.",
      },
      {
        to: '/guests',
        tagline: 'Guests, companies and groups',
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
        tagline: 'Rooms, rates, booking engine and OTAs',
        label: 'Rates & channels',
        icon: Tag,
        // Rooms (rooms.setup), rate plans and the rate calendar (rates.edit, and read-only for
        // reservation.manage so the front desk can quote by phone); /rates opens the first tab a
        // member can see. Channels get their own booking_engine gate.
        feature: 'front_desk',
        roles: ['general_manager', 'revenue_manager'],
        needs: ['rooms.setup', 'rates.edit', 'reservation.manage'],
        stage: 1,
        about: 'Rooms, rate plans, restrictions, your booking engine and the OTAs, in one place.',
      },
    ],
  },
  {
    label: 'Operations',
    entries: [
      {
        to: '/housekeeping',
        tagline: 'Room status and inspections',
        label: 'Housekeeping',
        icon: Sparkles,
        feature: 'housekeeping',
        roles: ['general_manager', 'housekeeping_supervisor', 'room_attendant', 'front_desk'],
        stage: 2,
        about: 'Room status board, attendant assignments, inspections and minibar.',
      },
      {
        to: '/maintenance',
        tagline: 'Work orders and the diesel log',
        label: 'Maintenance',
        icon: Wrench,
        feature: 'housekeeping',
        roles: ['general_manager', 'maintenance', 'housekeeping_supervisor'],
        stage: 2,
        about: 'Work orders, out-of-order rooms, and the power and diesel log.',
      },
      {
        to: '/restaurant',
        tagline: 'Orders, tickets and bills to rooms',
        label: 'Restaurant & bar',
        icon: UtensilsCrossed,
        feature: 'restaurant_pos',
        roles: ['general_manager', 'fnb_manager', 'cashier', 'waiter'],
        stage: 3,
        about: 'Orders, kitchen tickets, bills to rooms, voids and comps, even offline.',
      },
      {
        to: '/stores',
        tagline: 'Stock, purchasing and counts',
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
        tagline: 'Ledgers, city ledger and tax',
        label: 'Finance',
        icon: Landmark,
        feature: 'finance',
        roles: ['general_manager', 'finance'],
        stage: 5,
        about: 'City ledger, the books per company, reconciliation and taxes.',
      },
      {
        to: '/hr',
        tagline: 'Staff, rosters and payroll',
        label: 'HR & payroll',
        icon: IdCard,
        feature: 'hr_payroll',
        roles: ['general_manager', 'hr', 'finance'],
        stage: 5,
        about: 'Staff records, rosters, attendance, leave and payroll.',
      },
      {
        to: '/analytics',
        tagline: 'Occupancy, ADR and board packs',
        label: 'Analytics',
        icon: ChartColumn,
        feature: 'analytics',
        roles: ['general_manager', 'revenue_manager', 'finance', 'viewer'],
        stage: 6,
        about: 'Occupancy, ADR, RevPAR and the group at a glance, with board packs.',
      },
      {
        to: '/leakage',
        tagline: 'Voids, discounts and comps by name',
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

type Can = (permission: Permission) => boolean

// Whether this role uses the entry. Owners and group admins see every module. Built modules go by
// permission (`can` answers for the role shown, previews included), the rest by role.
export function roleSees(role: MemberRole, entry: ModuleEntry, can?: Can): boolean {
  if (role === 'owner' || role === 'group_admin') return true
  if (entry.needs && can) return entry.needs.some(can)
  return entry.roles.includes(role)
}

// Roles whose job can span the group, so their Home has an "All hotels" view (design: ExecHome).
// Other roles work in one hotel at a time, even when an owner previews them.
const GROUP_VIEW_ROLES: readonly MemberRole[] = ['owner', 'group_admin', 'finance', 'viewer']

export function spansGroup(role: MemberRole): boolean {
  return GROUP_VIEW_ROLES.includes(role)
}

// The menu for a role and the modules switched on for the group.
export function visibleGroups(
  role: MemberRole,
  has: (feature: Feature) => boolean,
  can?: Can,
): NavGroup[] {
  return MODULES.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => has(entry.feature) && roleSees(role, entry, can)),
  })).filter((group) => group.entries.length > 0)
}
