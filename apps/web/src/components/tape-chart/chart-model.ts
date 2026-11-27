// The tape chart's pure parts (spec: "The chart"): which rows show (type header, the Unassigned
// lane, rooms by floor and number, Available), where each bar sits, whether a room is free for a
// stay's nights and why not, and the phone day list. No React, so it is tested without a browser.
import {
  addDays,
  barSpan,
  type ChartRoom,
  type ChartRoomType,
  type ChartStay,
  compareRoomNumbers,
  formatRateDate,
  nightsBetween,
  OOO_REASON_LABELS,
  type OutOfOrderView,
  type RoomStatus,
  rangeLabel,
  rangesOverlap,
  type TapeChart,
} from '@vento/shared'

export const ROW = { type: 32, room: 44, available: 30, unassigned: 30, lane: 34 } as const
export const LABEL_WIDTH = 196
// Rows are windowed above this many rooms (hotels of 200+ rooms are the design's revision trigger).
export const VIRTUAL_FROM = 150

export type Filters = {
  typeId?: string | undefined
  floor?: number | undefined
  // The Tonight strip's toggles: only rooms occupied, vacant or out of order tonight.
  tonight?: 'occupied' | 'vacant' | 'out_of_order' | undefined
  unassigned?: boolean
}

export type LaneStay = { stay: ChartStay; lane: number }

export type Row =
  | { kind: 'type'; key: string; type: ChartRoomType; height: number }
  | {
      kind: 'unassigned'
      key: string
      type: ChartRoomType
      expanded: boolean
      stays: LaneStay[]
      height: number
    }
  | { kind: 'room'; key: string; type: ChartRoomType; room: ChartRoom; height: number }
  | { kind: 'available'; key: string; type: ChartRoomType; height: number }

// Stacks overlapping bars into lanes, first free lane first.
export function laneStays(stays: readonly ChartStay[]): { stays: LaneStay[]; lanes: number } {
  const ends: string[] = []
  const placed: LaneStay[] = []
  const sorted = [...stays].sort(
    (a, b) => a.arrival.localeCompare(b.arrival) || a.departure.localeCompare(b.departure),
  )
  for (const stay of sorted) {
    let lane = ends.findIndex((end) => end <= stay.arrival)
    if (lane === -1) {
      lane = ends.length
      ends.push(stay.departure)
    } else {
      ends[lane] = stay.departure
    }
    placed.push({ stay, lane })
  }
  return { stays: placed, lanes: Math.max(1, ends.length) }
}

export const unassignedOf = (chart: TapeChart, typeId: string) =>
  chart.stays.filter((stay) => stay.roomTypeId === typeId && stay.roomId === null)

// The rows to draw, in order, with the counts the header line reads.
export function buildRows(
  chart: TapeChart,
  filters: Filters,
  expanded: ReadonlySet<string>,
): { rows: Row[]; shown: number; total: number } {
  const rows: Row[] = []
  let shown = 0
  for (const type of chart.roomTypes) {
    if (filters.typeId && type.id !== filters.typeId) continue
    const waiting = unassignedOf(chart, type.id)
    if (filters.unassigned && waiting.length === 0) continue
    const rooms = chart.rooms
      .filter((room) => room.roomTypeId === type.id)
      .filter((room) => filters.floor === undefined || room.floor === filters.floor)
      .filter(
        (room) => !filters.tonight || tonightGroup(occupancyOf(chart, room)) === filters.tonight,
      )
      .sort((a, b) => a.floor - b.floor || compareRoomNumbers(a.number, b.number))
    if (rooms.length === 0 && waiting.length === 0) continue
    rows.push({ kind: 'type', key: `type-${type.id}`, type, height: ROW.type })
    if (waiting.length) {
      const open = expanded.has(type.id)
      const laned = laneStays(waiting)
      rows.push({
        kind: 'unassigned',
        key: `lane-${type.id}`,
        type,
        expanded: open,
        stays: laned.stays,
        height: open ? Math.max(ROW.unassigned, laned.lanes * ROW.lane + 4) : ROW.unassigned,
      })
    }
    for (const room of rooms) {
      rows.push({ kind: 'room', key: room.id, type, room, height: ROW.room })
    }
    shown += rooms.length
    rows.push({ kind: 'available', key: `avail-${type.id}`, type, height: ROW.available })
  }
  return { rows, shown, total: chart.rooms.length }
}

export const floorsOf = (chart: TapeChart) =>
  [...new Set(chart.rooms.map((room) => room.floor))].sort((a, b) => a - b)

export const totalUnassigned = (chart: TapeChart) =>
  chart.stays.filter((stay) => stay.roomId === null).length

export function staysByRoom(chart: TapeChart): Map<string, ChartStay[]> {
  const map = new Map<string, ChartStay[]>()
  for (const stay of chart.stays) {
    if (!stay.roomId) continue
    map.set(stay.roomId, [...(map.get(stay.roomId) ?? []), stay])
  }
  return map
}

export function periodsByRoom(chart: TapeChart): Map<string, OutOfOrderView[]> {
  const map = new Map<string, OutOfOrderView[]>()
  for (const period of chart.outOfOrder) {
    map.set(period.roomId, [...(map.get(period.roomId) ?? []), period])
  }
  return map
}

// The status a room label shows tonight: Out of order on the nights a period covers, else stored.
export function shownStatus(
  room: Pick<ChartRoom, 'status'>,
  periods: readonly OutOfOrderView[] | undefined,
  date: string,
): RoomStatus | 'out_of_order' {
  const off = periods?.some((p) => p.from <= date && date < p.backInService)
  return off ? 'out_of_order' : room.status
}

// The period a room has now or next (for the room menu's Change dates / Back in service).
export function currentOrNext(periods: readonly OutOfOrderView[] | undefined, date: string) {
  return (periods ?? [])
    .filter((period) => period.backInService > date)
    .sort((a, b) => a.from.localeCompare(b.from))[0]
}

// Whether a room can take a stay for its nights, and why not ("402 · Shittu R. 26–27 Nov").
export function roomFreeFor(
  chart: TapeChart,
  room: ChartRoom,
  stay: Pick<ChartStay, 'id' | 'arrival' | 'departure' | 'adults' | 'children'>,
): { free: true } | { free: false; why: string } {
  const type = chart.roomTypes.find((t) => t.id === room.roomTypeId)
  if (type && (stay.adults > type.maxAdults || stay.children > type.maxChildren)) {
    return { free: false, why: `${room.number} · sleeps ${type.maxAdults}` }
  }
  const taken = chart.stays.find(
    (other) =>
      other.id !== stay.id &&
      other.roomId === room.id &&
      rangesOverlap(other.arrival, other.departure, stay.arrival, stay.departure),
  )
  if (taken) {
    return {
      free: false,
      why: `${room.number} · ${taken.guestShort} ${rangeLabel(taken.arrival, taken.departure)}`,
    }
  }
  const off = chart.outOfOrder.find(
    (period) =>
      period.roomId === room.id &&
      rangesOverlap(period.from, period.backInService, stay.arrival, stay.departure),
  )
  if (off) {
    return {
      free: false,
      why: `${room.number} · Out of order ${rangeLabel(off.from, off.backInService)}`,
    }
  }
  return { free: true }
}

// "Mensah D." with "· 3 nights" when there is room; the surname only below 2 nights wide.
// What fits on a bar `width` pixels wide (12px text, about 6.6px a character): "Mensah D. · 3
// nights", "Mensah D.", "Mensah", then initials "DM". Never a cut-off name; the full name is in the
// tooltip and the accessible name.
const CHAR_PX = 6.6
const BAR_PADDING = 14
export function barText(stay: ChartStay, width: number): { name: string; sub: string } {
  const room = width - BAR_PADDING
  const fits = (text: string) => text.length * CHAR_PX <= room
  const nights = nightsBetween(stay.arrival, stay.departure)
  const sub = `· ${nights === 1 ? '1 night' : `${nights} nights`}`
  const short = stay.guestShort
  if (fits(`${short} ${sub}`)) return { name: short, sub }
  if (fits(short)) return { name: short, sub: '' }
  const surname = short.replace(/ \S+\.$/, '')
  if (fits(surname)) return { name: surname, sub: '' }
  const initials = stay.guestName
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 3)
  return { name: initials, sub: '' }
}

// --- Tonight: who is in each room on the business date -------------------------------------------

// The front office word for a room on the business date: a stay over tonight that arrives today is
// Arriving, one already here is Occupied; a stay leaving today (with nobody arriving) is Leaving;
// else Vacant, or Out of order. Check-in is brick 8, so "occupied" means a stay booked over tonight.
export type Occupancy = 'occupied' | 'arriving' | 'leaving' | 'vacant' | 'out_of_order'

export function occupancyOf(
  chart: TapeChart,
  room: ChartRoom,
  date = chart.hotel.businessDate,
): Occupancy {
  const off = chart.outOfOrder.some(
    (p) => p.roomId === room.id && p.from <= date && date < p.backInService,
  )
  if (off) return 'out_of_order'
  const mine = chart.stays.filter((s) => s.roomId === room.id)
  if (mine.some((s) => s.arrival === date)) return 'arriving'
  if (mine.some((s) => s.arrival < date && date < s.departure)) return 'occupied'
  if (mine.some((s) => s.departure === date)) return 'leaving'
  return 'vacant'
}

// For the counts and filters: arriving rooms are occupied tonight, leaving ones vacant.
export const tonightGroup = (occupancy: Occupancy): 'occupied' | 'vacant' | 'out_of_order' =>
  occupancy === 'arriving' || occupancy === 'occupied'
    ? 'occupied'
    : occupancy === 'out_of_order'
      ? 'out_of_order'
      : 'vacant'

export const OCCUPANCY_WORDS: Record<Occupancy, string> = {
  occupied: 'Occupied',
  arriving: 'Arriving',
  leaving: 'Leaving',
  vacant: 'Vacant',
  out_of_order: 'Out of order',
}

// The Tonight strip: rooms occupied, vacant and out of order on the business date, and bookings over
// tonight with no room yet.
export function tonightCounts(chart: TapeChart, date = chart.hotel.businessDate) {
  const counts = { occupied: 0, vacant: 0, outOfOrder: 0, unassigned: 0 }
  for (const room of chart.rooms) {
    const group = tonightGroup(occupancyOf(chart, room, date))
    if (group === 'occupied') counts.occupied++
    else if (group === 'out_of_order') counts.outOfOrder++
    else counts.vacant++
  }
  counts.unassigned = chart.stays.filter(
    (s) => s.roomId === null && s.arrival <= date && date < s.departure,
  ).length
  return counts
}

// Where a bar sits in time against the business date.
export function barTime(stay: Pick<ChartStay, 'arrival' | 'departure'>, date: string) {
  if (stay.departure <= date) return 'past' as const
  if (stay.arrival <= date) return 'tonight' as const
  return 'later' as const
}

// "Daniel Mensah, Executive King, 25–28 Nov 2026, 3 nights, Room 502"
export function barLabel(stay: ChartStay, typeName: string, roomNumber: string | undefined) {
  const nights = nightsBetween(stay.arrival, stay.departure)
  return [
    stay.guestName,
    typeName,
    rangeLabel(stay.arrival, stay.departure, true),
    nights === 1 ? '1 night' : `${nights} nights`,
    roomNumber ? `Room ${roomNumber}` : 'Not assigned',
  ].join(', ')
}

export const STATUS_WORDS: Record<RoomStatus | 'out_of_order', string> = {
  inspected: 'Inspected',
  clean: 'Clean',
  dirty: 'Dirty',
  out_of_order: 'Out of order',
}

export { barSpan }

// The window's dates.
export const datesOf = (from: string, days: number) =>
  Array.from({ length: days }, (_, i) => addDays(from, i))

// --- The phone day list -------------------------------------------------------------------------------

export type DayRoom = {
  room: ChartRoom
  occupancy: Occupancy
  status: RoomStatus | 'out_of_order'
  // What's on that night.
  line: string | null
  stay: ChartStay | null
  period: OutOfOrderView | null
}

export type DaySection = {
  type: ChartRoomType
  left: number
  arriving: ChartStay[]
  rooms: DayRoom[]
}

// "AC", or the text given with Other.
export const oooReason = (period: Pick<OutOfOrderView, 'reason' | 'reasonText'>) =>
  period.reason === 'other' ? (period.reasonText ?? 'Other') : OOO_REASON_LABELS[period.reason]

export function dayList(chart: TapeChart, date: string): DaySection[] {
  const byRoom = staysByRoom(chart)
  const periods = periodsByRoom(chart)
  return chart.roomTypes
    .map((type) => {
      const night = type.nights.find((n) => n.date === date)
      const arriving = unassignedOf(chart, type.id).filter(
        (stay) => stay.arrival <= date && date < stay.departure,
      )
      const rooms = chart.rooms
        .filter((room) => room.roomTypeId === type.id)
        .sort((a, b) => a.floor - b.floor || compareRoomNumbers(a.number, b.number))
        .map((room): DayRoom => {
          const stay =
            byRoom.get(room.id)?.find((s) => s.arrival <= date && date < s.departure) ?? null
          const period =
            periods.get(room.id)?.find((p) => p.from <= date && date < p.backInService) ?? null
          const nights = stay ? nightsBetween(stay.arrival, stay.departure) : 0
          const line = period
            ? `Out of order until ${formatRateDate(period.backInService, false)} · ${oooReason(period)}`
            : stay
              ? stay.arrival === date
                ? `Arriving · ${stay.guestShort} · ${nights === 1 ? '1 night' : `${nights} nights`}`
                : `Staying · ${stay.guestShort}`
              : null
          return {
            room,
            occupancy: occupancyOf(chart, room, date),
            status: shownStatus(room, periods.get(room.id), date),
            line,
            stay,
            period,
          }
        })
      return { type, left: night?.left ?? 0, arriving, rooms }
    })
    .filter((section) => section.rooms.length > 0 || section.arriving.length > 0)
}

// Why a free-looking cell can't start a booking, or null when it can (the owner: no bookings on a
// room-day that isn't available): a past night, out of order, already booked, or the room type
// has no room left to sell that night.
export function cellProblem(chart: TapeChart, room: ChartRoom, date: string): string | null {
  const day = formatRateDate(date, false)
  if (date < chart.hotel.businessDate) return `${day} has passed`
  const off = chart.outOfOrder.find(
    (p) => p.roomId === room.id && p.from <= date && date < p.backInService,
  )
  if (off) return `${room.number} is out of order on ${day}`
  const taken = chart.stays.find(
    (s) => s.roomId === room.id && s.arrival <= date && date < s.departure,
  )
  if (taken) return `${room.number} is taken on ${day} (${taken.guestShort})`
  const type = chart.roomTypes.find((t) => t.id === room.roomTypeId)
  const night = type?.nights.find((n) => n.date === date)
  if (type && night && night.left <= 0) return `${type.name} is full on ${day}`
  return null
}

// The nights a room is busy (stays and out of order), for a booking started from one of its cells.
export function busyWindows(chart: TapeChart, roomId: string) {
  return [
    ...chart.stays
      .filter((s) => s.roomId === roomId)
      .map((s) => ({ from: s.arrival, to: s.departure, why: s.guestShort })),
    ...chart.outOfOrder
      .filter((p) => p.roomId === roomId)
      .map((p) => ({ from: p.from, to: p.backInService, why: 'out of order' })),
  ]
}

// A booked type with a room free every night of the stay (other than its own): moves to another
// type wait until it is full.
export function bookedTypeFree(
  chart: TapeChart,
  stay: Pick<
    ChartStay,
    'id' | 'arrival' | 'departure' | 'adults' | 'children' | 'roomTypeId' | 'roomId'
  >,
) {
  return chart.rooms.some(
    (r) =>
      r.roomTypeId === stay.roomTypeId && r.id !== stay.roomId && roomFreeFor(chart, r, stay).free,
  )
}
