// What each role's Home leads with (designs: GMHome for a hotel, ExecHome for the group): the
// figures that matter to that job and the actions they reach for first. Figures come from the
// modules that produce them, so until a module ships its tile says which one brings it.
import type { MemberRole, Permission } from '@vento/shared'
import {
  Ban,
  BedDouble,
  Boxes,
  CalendarClock,
  CalendarOff,
  CalendarPlus,
  ChartGantt,
  ChartLine,
  ChefHat,
  ClipboardCheck,
  Coins,
  DoorOpen,
  FileText,
  HandCoins,
  Landmark,
  LogIn,
  LogOut,
  type LucideIcon,
  Package,
  Percent,
  Receipt,
  Scale,
  SprayCan,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  UtensilsCrossed,
  Wallet,
  Wrench,
} from 'lucide-react'
import type { ModulePath } from '@/lib/navigation'

export type Figure = { label: string; icon: LucideIcon; from: ModulePath }
export type QuickAction = {
  label: string
  icon: LucideIcon
  to: ModulePath
  // Opens the module's New sheet (New reservation), or the walk-in page (brick 8).
  sheet?: 'new' | 'walk-in'
  needs?: Permission
}

export type RoleFocus = {
  // The job, as the banner names it: "Front desk · Kora Victoria Island".
  job: string
  // Heading over the figures for one hotel.
  today: (hotel: string) => string
  figures: Figure[]
  actions: QuickAction[]
}

const ARRIVALS: Figure = { label: 'Arrivals', icon: LogIn, from: '/front-desk' }
const DEPARTURES: Figure = { label: 'Departures', icon: LogOut, from: '/front-desk' }
const IN_HOUSE: Figure = { label: 'In house', icon: BedDouble, from: '/front-desk' }
const NEW_RESERVATION: QuickAction = {
  label: 'New reservation',
  icon: CalendarPlus,
  to: '/reservations',
  sheet: 'new',
  needs: 'reservation.manage',
}
const WALK_IN: QuickAction = {
  label: 'Walk-in',
  icon: DoorOpen,
  to: '/front-desk',
  sheet: 'walk-in',
  needs: 'stay.check_in',
}
const TAPE_CHART: QuickAction = { label: 'Tape chart', icon: ChartGantt, to: '/tape-chart' }
const RESTAURANT: QuickAction = { label: 'Open a bill', icon: UtensilsCrossed, to: '/restaurant' }

const HOTEL_LEAD: RoleFocus = {
  job: 'General manager',
  today: (hotel) => `Today at ${hotel}`,
  figures: [
    ARRIVALS,
    DEPARTURES,
    IN_HOUSE,
    { label: 'Revenue today', icon: TrendingUp, from: '/finance' },
  ],
  actions: [NEW_RESERVATION, WALK_IN, TAPE_CHART],
}

const FOCUS: Record<MemberRole, RoleFocus> = {
  owner: { ...HOTEL_LEAD, job: 'Owner' },
  group_admin: { ...HOTEL_LEAD, job: 'Group admin' },
  general_manager: HOTEL_LEAD,
  viewer: { ...HOTEL_LEAD, job: 'Viewer', actions: [] },
  revenue_manager: {
    job: 'Revenue',
    today: (hotel) => `Revenue at ${hotel}`,
    figures: [
      { label: 'Occupancy tonight', icon: Percent, from: '/front-desk' },
      { label: 'ADR', icon: Coins, from: '/analytics' },
      { label: 'RevPAR', icon: ChartLine, from: '/analytics' },
      { label: 'Pick-up, last 7 days', icon: TrendingUp, from: '/reservations' },
    ],
    actions: [
      { label: 'Rates & channels', icon: Percent, to: '/rates' },
      NEW_RESERVATION,
      TAPE_CHART,
    ],
  },
  sales: {
    job: 'Sales',
    today: (hotel) => `Sales at ${hotel}`,
    figures: [
      { label: 'Groups on the books', icon: Users, from: '/guests' },
      { label: 'Corporate accounts', icon: Landmark, from: '/guests' },
      { label: 'Quotes open', icon: FileText, from: '/guests' },
      { label: 'Room nights this month', icon: BedDouble, from: '/reservations' },
    ],
    actions: [{ label: 'Guests & sales', icon: Users, to: '/guests' }, NEW_RESERVATION],
  },
  front_desk: {
    job: 'Front desk',
    today: (hotel) => `Today at ${hotel}`,
    figures: [
      ARRIVALS,
      DEPARTURES,
      IN_HOUSE,
      { label: 'Rooms ready', icon: ClipboardCheck, from: '/housekeeping' },
    ],
    actions: [NEW_RESERVATION, WALK_IN, TAPE_CHART],
  },
  fnb_manager: {
    job: 'Restaurant & bar',
    today: (hotel) => `Restaurant & bar at ${hotel}`,
    figures: [
      { label: 'Covers today', icon: Users, from: '/restaurant' },
      { label: 'Open bills', icon: Receipt, from: '/restaurant' },
      { label: 'F&B revenue today', icon: TrendingUp, from: '/restaurant' },
      { label: 'Voids today', icon: Ban, from: '/restaurant' },
    ],
    actions: [RESTAURANT, { label: 'Stores', icon: Package, to: '/stores' }],
  },
  cashier: {
    job: 'Cashier',
    today: () => 'Your shift',
    figures: [
      { label: 'Open bills', icon: Receipt, from: '/restaurant' },
      { label: 'Payments taken', icon: HandCoins, from: '/restaurant' },
      // Never the expected cash: the cashier counts the drawer blind at close (docs/DOMAIN.md).
      { label: 'Bills closed this shift', icon: Wallet, from: '/restaurant' },
      { label: 'Bills posted to rooms', icon: BedDouble, from: '/restaurant' },
    ],
    actions: [RESTAURANT],
  },
  waiter: {
    job: 'Restaurant & bar',
    today: () => 'Your tables',
    figures: [
      { label: 'Your open tables', icon: UtensilsCrossed, from: '/restaurant' },
      { label: 'Orders in the kitchen', icon: ChefHat, from: '/restaurant' },
      { label: 'Bills posted to rooms', icon: BedDouble, from: '/restaurant' },
      { label: 'Covers today', icon: Users, from: '/restaurant' },
    ],
    actions: [RESTAURANT],
  },
  housekeeping_supervisor: {
    job: 'Housekeeping',
    today: (hotel) => `Housekeeping at ${hotel}`,
    figures: [
      { label: 'Dirty rooms', icon: SprayCan, from: '/housekeeping' },
      { label: 'Inspections due', icon: ClipboardCheck, from: '/housekeeping' },
      { label: 'Out of order', icon: Wrench, from: '/maintenance' },
      { label: 'Attendants on duty', icon: UserCheck, from: '/housekeeping' },
    ],
    actions: [
      { label: 'Room status', icon: SprayCan, to: '/housekeeping' },
      { label: 'Work orders', icon: Wrench, to: '/maintenance' },
    ],
  },
  room_attendant: {
    job: 'Housekeeping',
    today: () => 'Your rooms today',
    figures: [
      { label: 'Rooms assigned', icon: BedDouble, from: '/housekeeping' },
      { label: 'Rooms done', icon: ClipboardCheck, from: '/housekeeping' },
      { label: 'Early arrivals to clean', icon: CalendarClock, from: '/housekeeping' },
      { label: 'Minibar items to post', icon: Receipt, from: '/housekeeping' },
    ],
    actions: [{ label: 'My rooms', icon: SprayCan, to: '/housekeeping' }],
  },
  maintenance: {
    job: 'Maintenance',
    today: (hotel) => `Maintenance at ${hotel}`,
    figures: [
      { label: 'Open work orders', icon: Wrench, from: '/maintenance' },
      { label: 'Urgent', icon: CalendarClock, from: '/maintenance' },
      { label: 'Rooms out of order', icon: BedDouble, from: '/maintenance' },
      { label: 'Work orders done today', icon: ClipboardCheck, from: '/maintenance' },
    ],
    actions: [{ label: 'Work orders', icon: Wrench, to: '/maintenance' }],
  },
  storekeeper: {
    job: 'Stores',
    today: (hotel) => `Stores at ${hotel}`,
    figures: [
      { label: 'Below reorder level', icon: Boxes, from: '/stores' },
      { label: 'Requisitions to issue', icon: ClipboardCheck, from: '/stores' },
      { label: 'Deliveries due', icon: Truck, from: '/stores' },
      { label: 'Stock value', icon: Coins, from: '/stores' },
    ],
    actions: [{ label: 'Stores', icon: Package, to: '/stores' }],
  },
  finance: {
    job: 'Finance',
    today: (hotel) => `Finance at ${hotel}`,
    figures: [
      { label: 'Revenue today', icon: TrendingUp, from: '/finance' },
      { label: 'Unbalanced cashier shifts', icon: Scale, from: '/finance' },
      { label: 'City ledger due', icon: Landmark, from: '/finance' },
      { label: 'Exceptions yesterday', icon: Ban, from: '/leakage' },
    ],
    actions: [
      { label: 'Finance', icon: Landmark, to: '/finance' },
      { label: 'Leakage', icon: Ban, to: '/leakage' },
    ],
  },
  hr: {
    job: 'People',
    today: (hotel) => `People at ${hotel}`,
    figures: [
      { label: 'Staff on duty', icon: UserCheck, from: '/hr' },
      { label: 'Leave requests', icon: CalendarOff, from: '/hr' },
      { label: 'Next payroll', icon: Wallet, from: '/hr' },
      { label: 'Contracts ending', icon: FileText, from: '/hr' },
    ],
    actions: [{ label: 'HR & payroll', icon: Users, to: '/hr' }],
  },
}

export function roleFocus(role: MemberRole): RoleFocus {
  return FOCUS[role]
}

// The whole group at a glance (design: ExecHome). Finance leads with money; everyone else with
// how full and how well-sold the hotels are.
export function groupFigures(role: MemberRole): Figure[] {
  if (role === 'finance') {
    return [
      { label: 'Revenue this month', icon: TrendingUp, from: '/finance' },
      { label: 'City ledger outstanding', icon: Landmark, from: '/finance' },
      { label: 'Cash variances yesterday', icon: Scale, from: '/finance' },
      { label: 'Exceptions yesterday', icon: Ban, from: '/leakage' },
    ]
  }
  return [
    { label: 'Occupancy tonight', icon: Percent, from: '/front-desk' },
    { label: 'ADR', icon: Coins, from: '/analytics' },
    { label: 'RevPAR', icon: ChartLine, from: '/analytics' },
    { label: 'Revenue this month', icon: TrendingUp, from: '/finance' },
  ]
}
