// The tape chart, room assignment and moves, room status and out of order (spec:
// docs/specs/stage-1-tape-chart.md). Every procedure needs the front_desk feature. The chart reads
// with reservation readers, room.status or room.out_of_order; assigning needs room.move; status
// needs room.status (works offline: idempotent, the device's time decides); out of order needs
// room.out_of_order. Moves to another room type, extensions and bookings go through
// reservations.modify and reservations.create with a room. No input carries an organizationId.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { calendarDateSchema } from '../dates.ts'
import { idSchema } from '../ids.ts'
import {
  OOO_NOTE_MAX,
  OOO_REASON_TEXT_MAX,
  outOfOrderReasonSchema,
  ROOM_CHANGE_SOURCES,
  roomMoveReasonSchema,
  roomStatusSchema,
} from '../tape-chart.ts'

// `data.code` on errors from these procedures (and modify / create with a room), so the web app
// can react. The message is always fit to show.
export const ROOM_MOVE_ERROR_CODES = [
  'ROOM_TAKEN', // data: { roomId, number, date }
  'ROOM_OUT_OF_ORDER', // data: { roomId, number, from, backInService }
  'ROOM_TOO_SMALL',
  'ROOM_ARCHIVED',
  'ROOM_WRONG_HOTEL',
  'ROOM_WRONG_TYPE',
  'BOOKED_TYPE_FREE', // a move to another type while the booked type has a free room
  'NOT_MOVABLE',
  'MOVE_REASON_REQUIRED', // an in-house move needs a reason
  'NO_NIGHT_LEFT', // an in-house guest leaving today
  'ROOM_HAS_BOOKINGS', // room archive or type change with assigned stays
  'ROOM_OUT_OF_ORDER_PERIOD', // room archive or type change with an active out-of-order period
  'OOO_ROOM_HAS_BOOKINGS', // data: { stays }
  'OOO_WOULD_OVERBOOK', // data: { date, short, roomTypeId }
  'OOO_OVERLAPS', // data: { from, backInService }
  'OOO_PAST_DATE',
  'OOO_TOO_LONG',
  'OOO_REASON_REQUIRED',
  'OOO_ENDED',
  'OOO_CHANGED',
  'IDEMPOTENCY_CONFLICT',
  'RESERVATION_CHANGED',
  'PROPERTY_NOT_FOUND',
  'PROPERTY_ARCHIVED',
  'FEATURE_OFF',
] as const
export type RoomMoveErrorCode = (typeof ROOM_MOVE_ERROR_CODES)[number]

// --- The chart ----------------------------------------------------------------------------------------

export const tapeChartInputSchema = z.object({
  propertyId: idSchema,
  // First night shown; the business date − 2 when left out.
  from: calendarDateSchema.optional(),
  days: z.union([z.literal(1), z.literal(7), z.literal(14), z.literal(30)]).default(14),
})
export type TapeChartInput = z.input<typeof tapeChartInputSchema>

const night = z.object({
  date: calendarDateSchema,
  // Active rooms of the type, those out of order that night, and rooms booked.
  rooms: z.number().int(),
  outOfOrder: z.number().int(),
  booked: z.number().int(),
  // rooms − out of order − booked (can be below 0 when overbooked within the limit).
  left: z.number().int(),
  // Bookings of the type with no room that night.
  unassigned: z.number().int(),
})

export const chartRoomTypeSchema = z.object({
  id: idSchema,
  name: z.string(),
  code: z.string(),
  maxAdults: z.number().int(),
  maxChildren: z.number().int(),
  // Tonight's Best available price, or null when not priced; all-in when the plan's prices include
  // taxes and service charge (decision 0032).
  tonightPrice: z.string().nullable(),
  tonightIncludesTaxes: z.boolean(),
  nights: z.array(night),
})
export type ChartRoomType = z.infer<typeof chartRoomTypeSchema>

export const chartRoomSchema = z.object({
  id: idSchema,
  number: z.string(),
  floor: z.number().int(),
  roomTypeId: idSchema,
  features: z.array(z.string()),
  accessible: z.boolean(),
  // Numbers of the rooms it connects to.
  connectsTo: z.array(z.string()),
  status: roomStatusSchema,
  // Who set it and when (null for statuses from set-up before brick 7).
  statusBy: z.string().nullable(),
  statusAt: z.iso.datetime().nullable(),
})
export type ChartRoom = z.infer<typeof chartRoomSchema>

export const outOfOrderViewSchema = z.object({
  id: idSchema,
  roomId: idSchema,
  roomNumber: z.string(),
  from: calendarDateSchema,
  backInService: calendarDateSchema,
  reason: outOfOrderReasonSchema,
  reasonText: z.string().nullable(),
  note: z.string().nullable(),
  byName: z.string(),
  // active: on the chart; removed: taken off before it started (kept for history).
  status: z.enum(['active', 'removed']),
  version: z.number().int(),
})
export type OutOfOrderView = z.infer<typeof outOfOrderViewSchema>

export const chartStaySchema = z.object({
  id: idSchema,
  reservationId: idSchema,
  number: z.string(),
  guestName: z.string(),
  guestShort: z.string(),
  roomTypeId: idSchema,
  planName: z.string(),
  arrival: calendarDateSchema,
  departure: calendarDateSchema,
  adults: z.number().int(),
  children: z.number().int(),
  roomId: idSchema.nullable(),
  // The first night in `roomId` (decision 0030): the arrival, or the business date of an in-house
  // move; the nights before are in `segments`.
  roomFrom: calendarDateSchema,
  segments: z.array(
    z.object({ roomId: idSchema, from: calendarDateSchema, to: calendarDateSchema }),
  ),
  version: z.number().int(),
  status: z.enum(['confirmed', 'checked_in']),
  // Confirmed and arriving on or after the business date, or in house with a night left.
  movable: z.boolean(),
  depositDue: z.object({ amount: z.string(), dueAt: z.iso.datetime() }).nullable(),
})
export type ChartStay = z.infer<typeof chartStaySchema>

export const tapeChartSchema = z.object({
  hotel: z.object({
    id: idSchema,
    name: z.string(),
    businessDate: calendarDateSchema,
    timeZone: z.string(),
    live: z.boolean(),
  }),
  from: calendarDateSchema,
  days: z.number().int(),
  // What the reader may do (the server checks again on every action).
  can: z.object({
    open: z.boolean(),
    move: z.boolean(),
    manage: z.boolean(),
    status: z.boolean(),
    outOfOrder: z.boolean(),
    setUpRooms: z.boolean(),
  }),
  roomTypes: z.array(chartRoomTypeSchema),
  rooms: z.array(chartRoomSchema),
  outOfOrder: z.array(outOfOrderViewSchema),
  stays: z.array(chartStaySchema),
})
export type TapeChart = z.infer<typeof tapeChartSchema>

// --- Room options and assignment ------------------------------------------------------------------------

export const roomOptionsInputSchema = z.object({
  stayId: idSchema,
  version: z.number().int().min(1),
})

export const roomOptionSchema = z.object({
  id: idSchema,
  number: z.string(),
  floor: z.number().int(),
  features: z.array(z.string()),
  connectsTo: z.array(z.string()),
  accessible: z.boolean(),
  status: roomStatusSchema,
})
export type RoomOption = z.infer<typeof roomOptionSchema>

export const roomOptionsSchema = z.object({
  stay: z.object({
    id: idSchema,
    reservationId: idSchema,
    number: z.string(),
    version: z.number().int(),
    guestName: z.string(),
    roomTypeId: idSchema,
    roomTypeName: z.string(),
    planName: z.string(),
    arrival: calendarDateSchema,
    departure: calendarDateSchema,
    adults: z.number().int(),
    children: z.number().int(),
    room: z.object({ id: idSchema, number: z.string() }).nullable(),
    // Sold price of the first night, as the plan quotes it ("Keep ₦168,000.00 a night").
    soldPerNight: z.string(),
    // Whether the plan's prices (and so `soldPerNight` and `difference`) include taxes.
    pricesIncludeTaxes: z.boolean(),
    nationality: z.string(),
  }),
  // Status badges only matter for an arrival on the business date (or a guest in house).
  arrivesToday: z.boolean(),
  // In house (brick 8): the move starts on `from` (the business date), a reason is required, and
  // the old room turns dirty.
  inHouse: z.boolean(),
  from: calendarDateSchema,
  // Rooms of the stay's type free every night: ready first, then dirty.
  sameType: z.array(roomOptionSchema),
  // Other types the plan sells and the party fits, cheapest first.
  otherTypes: z.array(
    z.object({
      roomTypeId: idSchema,
      name: z.string(),
      // Plan price difference a night against the stay's type, on the plan's basis (signed,
      // "60000.00").
      difference: z.string(),
      rooms: z.array(roomOptionSchema),
    }),
  ),
  // Why the stay can't move (arrival passed), or null.
  blocked: z.string().nullable(),
  // The mover's discount limit, for the Keep line ("over your 12% limit").
  discountLimit: z.string().nullable(),
  canDiscount: z.boolean(),
})
export type RoomOptions = z.infer<typeof roomOptionsSchema>

export const assignRoomInputSchema = z
  .object({
    // Made when the drag or dialog started: a retry returns the first result.
    idempotencyKey: z.uuidv7(),
    stayId: idSchema,
    version: z.number().int().min(1),
    // Null removes the room (unassigned).
    roomId: idSchema.nullable(),
    reason: roomMoveReasonSchema.optional(),
    reasonText: z.string().trim().max(200, 'Use 200 characters or fewer').optional(),
    source: z.enum(ROOM_CHANGE_SOURCES).default('dialog'),
  })
  .refine((input) => input.reason !== 'other' || Boolean(input.reasonText), {
    message: 'Say why, in a few words',
    path: ['reasonText'],
  })
export type AssignRoomInput = z.input<typeof assignRoomInputSchema>

export const assignedRoomSchema = z.object({
  stayId: idSchema,
  reservationId: idSchema,
  guestName: z.string(),
  version: z.number().int(),
  room: z.object({ id: idSchema, number: z.string() }).nullable(),
  previous: z.object({ id: idSchema, number: z.string() }).nullable(),
})
export type AssignedRoom = z.infer<typeof assignedRoomSchema>

// --- Room status (works offline) -------------------------------------------------------------------------

export const setRoomStatusInputSchema = z.object({
  // Made on the device when the change was made; a resend applies once.
  idempotencyKey: z.uuidv7(),
  propertyId: idSchema,
  roomId: idSchema,
  status: z.enum(['clean', 'dirty']),
  // When it happened on the device (offline changes sync later).
  occurredAt: z.iso.datetime(),
  source: z.enum(['chart', 'day_list', 'undo']).default('chart'),
})
export type SetRoomStatusInput = z.input<typeof setRoomStatusInputSchema>

export const roomStatusResultSchema = z.object({
  roomId: idSchema,
  number: z.string(),
  // applied; or superseded: a later change on the server was kept.
  outcome: z.enum(['applied', 'superseded']),
  status: roomStatusSchema,
  statusBy: z.string().nullable(),
  statusAt: z.iso.datetime().nullable(),
  // The sync queue's words when superseded.
  message: z.string().nullable(),
})
export type RoomStatusResult = z.infer<typeof roomStatusResultSchema>

// --- Out of order -----------------------------------------------------------------------------------------

const changeReason = z.string().trim().min(3, 'Say why, in a few words').max(200)

export const outOfOrderCheckInputSchema = z.object({
  propertyId: idSchema,
  roomId: idSchema,
  from: calendarDateSchema,
  backInService: calendarDateSchema,
  // When changing a period's dates: that period (its own nights don't count against it).
  periodId: idSchema.optional(),
})

export const outOfOrderCheckSchema = z.object({
  nights: z.number().int(),
  roomTypeName: z.string(),
  // Stays assigned to the room on those nights ("Room 503 has Emeka Kalu on 25–27 Nov.").
  blockers: z.array(
    z.object({
      stayId: idSchema,
      reservationId: idSchema,
      guestName: z.string(),
      arrival: calendarDateSchema,
      departure: calendarDateSchema,
    }),
  ),
  // Nights that would hold more bookings than rooms (counting unassigned bookings).
  shortfalls: z.array(z.object({ date: calendarDateSchema, short: z.number().int() })),
  // Rooms of the type left on each added night after taking this one off.
  left: z.array(z.object({ date: calendarDateSchema, left: z.number().int() })),
  // The first thing that stops it, as the server would say it; null when it can be saved.
  problem: z.object({ code: z.string(), message: z.string() }).nullable(),
})
export type OutOfOrderCheck = z.infer<typeof outOfOrderCheckSchema>

const oooFields = {
  reason: outOfOrderReasonSchema,
  reasonText: z.string().trim().max(OOO_REASON_TEXT_MAX).optional(),
  note: z.string().trim().max(OOO_NOTE_MAX, `Use ${OOO_NOTE_MAX} characters or fewer`).optional(),
}

export const createOutOfOrderInputSchema = z
  .object({
    idempotencyKey: z.uuidv7(),
    propertyId: idSchema,
    roomId: idSchema,
    from: calendarDateSchema,
    backInService: calendarDateSchema,
    ...oooFields,
  })
  .refine((input) => input.backInService > input.from, {
    message: 'Back in service must be after From',
    path: ['backInService'],
  })
export type CreateOutOfOrderInput = z.input<typeof createOutOfOrderInputSchema>

export const changeOutOfOrderInputSchema = z
  .object({
    idempotencyKey: z.uuidv7(),
    periodId: idSchema,
    version: z.number().int().min(1),
    from: calendarDateSchema,
    backInService: calendarDateSchema,
    changeReason,
  })
  .refine((input) => input.backInService > input.from, {
    message: 'Back in service must be after From',
    path: ['backInService'],
  })
export type ChangeOutOfOrderInput = z.input<typeof changeOutOfOrderInputSchema>

export const endOutOfOrderInputSchema = z.object({
  idempotencyKey: z.uuidv7(),
  periodId: idSchema,
  version: z.number().int().min(1),
  // A current period: the room comes back dirty (default) or clean. Ignored for an upcoming one.
  status: z.enum(['clean', 'dirty']).default('dirty'),
  changeReason,
})
export type EndOutOfOrderInput = z.input<typeof endOutOfOrderInputSchema>

export const tapeChartContract = {
  tapeChart: {
    get: oc.input(tapeChartInputSchema).output(tapeChartSchema),
  },
  stays: {
    roomOptions: oc.input(roomOptionsInputSchema).output(roomOptionsSchema),
    assignRoom: oc.input(assignRoomInputSchema).output(assignedRoomSchema),
  },
  rooms: {
    setStatus: oc.input(setRoomStatusInputSchema).output(roomStatusResultSchema),
    outOfOrder: {
      check: oc.input(outOfOrderCheckInputSchema).output(outOfOrderCheckSchema),
      create: oc.input(createOutOfOrderInputSchema).output(outOfOrderViewSchema),
      change: oc.input(changeOutOfOrderInputSchema).output(outOfOrderViewSchema),
      end: oc.input(endOutOfOrderInputSchema).output(outOfOrderViewSchema),
    },
  },
}
