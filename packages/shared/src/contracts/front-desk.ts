// The front desk lists, check-in, walk-in, registrations and the registration card (spec:
// docs/specs/stage-1-front-desk-check-in.md). Every procedure needs the front_desk feature and
// takes the hotel or the stay; nothing carries an organizationId. ID numbers are masked in every
// output except registrations.reveal; ID images are never in an output, only a 60-second link.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { calendarDateSchema } from '../dates.ts'
import { idSchema } from '../ids.ts'
import { pageSchema } from '../pagination.ts'
import {
  ID_DOCUMENT_TYPES,
  idTypeSchema,
  registrationFieldSchema,
  registrationInputSchema,
  registrationViewSchema,
  ruleSetSchema,
} from '../registration.ts'
import { createReservationSchema, guestChoiceSchema } from './reservations.ts'
import { roomOptionSchema } from './tape-chart.ts'

// `data.code` on errors from these procedures, so the web app can react; the message is always fit
// to show. Brick 7's room codes (ROOM_TAKEN, ROOM_OUT_OF_ORDER, ROOM_TOO_SMALL, ROOM_ARCHIVED,
// BOOKED_TYPE_FREE) and brick 6's RESERVATION_CHANGED come back too.
export const CHECK_IN_ERROR_CODES = [
  'NOT_ARRIVING_TODAY',
  'ARRIVAL_PASSED',
  'ALREADY_CHECKED_IN', // data: { byName, at }
  'NOT_CHECKED_IN',
  'ROOM_REQUIRED',
  'REGISTRATION_INCOMPLETE', // data: { fields, guest }
  'ID_DOCUMENT_REQUIRED',
  'ID_DOCUMENT_INVALID',
  'ID_DOCUMENT_TOO_LARGE',
  'ID_DOCUMENT_NOT_FOUND',
  'SKIP_ID_DOCUMENT_NOT_ALLOWED',
  'UNDO_EXPIRED',
  'REVERSE_NOT_SAME_DAY',
  'SELF_REVERSE',
  'NO_NIGHT_LEFT',
  'MOVE_REASON_REQUIRED',
  'BUSINESS_DATE_MOVED',
  'REVEAL_REASON_REQUIRED',
  'NOT_A_WALK_IN',
  'IDEMPOTENCY_CONFLICT',
] as const

export const FRONT_DESK_TABS = ['arrivals', 'departures', 'in_house'] as const
export type FrontDeskTab = (typeof FRONT_DESK_TABS)[number]
export const FRONT_DESK_PILLS = ['all', 'unassigned', 'not_ready'] as const
export type FrontDeskPill = (typeof FRONT_DESK_PILLS)[number]
export const FRONT_DESK_PAGE_SIZE = 100

// --- The lists ------------------------------------------------------------------------------------

export const frontDeskListInputSchema = z.object({
  propertyId: idSchema,
  tab: z.enum(FRONT_DESK_TABS),
  // Tomorrow's arrivals (kept on the desk PC for offline use, decision 0029).
  day: z.enum(['today', 'tomorrow']).default('today'),
  search: z.string().trim().max(60).optional(),
  pill: z.enum(FRONT_DESK_PILLS).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(FRONT_DESK_PAGE_SIZE).default(FRONT_DESK_PAGE_SIZE),
})
export type FrontDeskListInput = z.input<typeof frontDeskListInputSchema>

// What the Ready column says about the arrival's room: its housekeeping status, "Due out" when the
// room's in-house guest leaves today, or out of order.
export const READINESS = ['inspected', 'clean', 'dirty', 'due_out', 'out_of_order', 'none'] as const
export type Readiness = (typeof READINESS)[number]

export const frontDeskRowSchema = z.object({
  stayId: idSchema,
  reservationId: idSchema,
  number: z.string(),
  source: z.string(),
  status: z.enum(['confirmed', 'checked_in']),
  version: z.number().int(),
  guestId: idSchema,
  guestName: z.string(),
  guestShort: z.string(),
  nationality: z.string(),
  foreign: z.boolean(),
  roomTypeId: idSchema,
  roomTypeName: z.string(),
  room: z
    .object({
      id: idSchema,
      number: z.string(),
      status: z.enum(['clean', 'inspected', 'dirty']),
      statusBy: z.string().nullable(),
      statusAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  readiness: z.enum(READINESS),
  // "Due out · Asante K.", "503 is out of order"
  readinessText: z.string().nullable(),
  arrival: calendarDateSchema,
  departure: calendarDateSchema,
  nights: z.number().int(),
  adults: z.number().int(),
  children: z.number().int(),
  notes: z.string().nullable(),
  planName: z.string(),
  checkedIn: z.object({ at: z.iso.datetime(), byName: z.string() }).nullable(),
  // Checked in today into a room not yet clean or inspected.
  waitingForRoom: z.boolean(),
  // Checked in without the lead guest's ID photo.
  idPhotoMissing: z.boolean(),
  cardPrinted: z.boolean(),
  // In house: night 2 of 3 (the business date's night).
  night: z.object({ n: z.number().int(), of: z.number().int() }).nullable(),
  // Why Check in isn't offered, or null.
  checkInBlocked: z.string().nullable(),
})
export type FrontDeskRow = z.infer<typeof frontDeskRowSchema>

export const tonightSchema = z.object({
  date: calendarDateSchema,
  // Rooms with a checked-in stay over tonight; rooms with a confirmed assigned stay arriving
  // tonight; rooms out of order tonight; the rest; confirmed stays over tonight with no room.
  occupied: z.number().int(),
  arriving: z.number().int(),
  vacant: z.number().int(),
  outOfOrder: z.number().int(),
  unassigned: z.number().int(),
})
export type Tonight = z.infer<typeof tonightSchema>

export const frontDeskListSchema = pageSchema(frontDeskRowSchema).extend({
  hotel: z.object({
    id: idSchema,
    name: z.string(),
    businessDate: calendarDateSchema,
    timeZone: z.string(),
    checkInTime: z.string(),
    archived: z.boolean(),
  }),
  day: calendarDateSchema,
  counts: z.object({
    // Arrivals still to come and those checked in today (Checked in today section).
    toCome: z.number().int(),
    checkedInToday: z.number().int(),
    departures: z.number().int(),
    inHouse: z.number().int(),
    inHouseGuests: z.number().int(),
    // Pills on Arrivals.
    unassigned: z.number().int(),
    notReady: z.number().int(),
    // Tomorrow's arrivals (the empty state's "Tomorrow has 31 arrivals").
    tomorrow: z.number().int(),
  }),
  tonight: tonightSchema,
  can: z.object({
    checkIn: z.boolean(),
    walkIn: z.boolean(),
    move: z.boolean(),
    manage: z.boolean(),
    reverse: z.boolean(),
    viewId: z.boolean(),
  }),
})
export type FrontDeskList = z.infer<typeof frontDeskListSchema>

export const frontDeskHotelSchema = z.object({
  id: idSchema,
  name: z.string(),
  businessDate: calendarDateSchema,
  arrivals: z.number().int(),
  inHouse: z.number().int(),
  archived: z.boolean(),
})
export type FrontDeskHotel = z.infer<typeof frontDeskHotelSchema>

// --- Check-in ------------------------------------------------------------------------------------

export const CHECK_IN_SOURCES = ['arrivals', 'reservation', 'tape_chart', 'offline'] as const
export type CheckInSource = (typeof CHECK_IN_SOURCES)[number]

// What the sheet needs (masked numbers only).
export const previousRegistrationSchema = registrationViewSchema.extend({
  hotelName: z.string(),
  // The stay's arrival the registration is from ("From her stay on 14 Oct 2026").
  arrival: calendarDateSchema,
  // An ID document that can be reused (same guest, ID not expired), or null.
  reusableDocument: z
    .object({ id: idSchema, capturedAt: z.iso.datetime(), contentType: z.string() })
    .nullable(),
})
export type PreviousRegistration = z.infer<typeof previousRegistrationSchema>

const fieldSet = z.object({
  required: z.array(registrationFieldSchema),
  optional: z.array(registrationFieldSchema),
})

export const checkInPrepareSchema = z.object({
  stay: z.object({
    id: idSchema,
    reservationId: idSchema,
    number: z.string(),
    version: z.number().int(),
    status: z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']),
    arrival: calendarDateSchema,
    departure: calendarDateSchema,
    nights: z.number().int(),
    adults: z.number().int(),
    children: z.number().int(),
    roomTypeId: idSchema,
    roomTypeName: z.string(),
    planName: z.string(),
    pricePerNight: z.string(),
    pricesIncludeTaxes: z.boolean(),
    notes: z.string().nullable(),
  }),
  guest: z.object({
    id: idSchema,
    title: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    nationality: z.string(),
    hasContact: z.boolean(),
  }),
  hotel: z.object({
    id: idSchema,
    name: z.string(),
    businessDate: calendarDateSchema,
    checkInTime: z.string(),
    timeZone: z.string(),
  }),
  room: z
    .object({
      id: idSchema,
      number: z.string(),
      status: z.enum(['clean', 'inspected', 'dirty']),
      statusBy: z.string().nullable(),
      statusAt: z.iso.datetime().nullable(),
      // Why it isn't ready ("402: Kwame Asante is due out today and hasn't left yet."), or null.
      notReady: z.string().nullable(),
      // Why it can't be used (taken, out of order, removed, too small), or null.
      problem: z.string().nullable(),
    })
    .nullable(),
  // Rooms of the booked type free for the stay, ready first (brick 7's stays.roomOptions order).
  rooms: z.array(roomOptionSchema),
  // True when no room of the booked type is free: the Room step offers the Room move dialog's
  // upgrade (brick 7) instead.
  bookedTypeFull: z.boolean(),
  rules: z.object({
    version: z.string(),
    lead: fieldSet,
    foreign: fieldSet,
    ecowas: z.array(z.string()),
  }),
  previous: previousRegistrationSchema.nullable(),
  // Why the stay can't be checked in now, or null.
  blocked: z.string().nullable(),
  early: z.boolean(),
  can: z.object({
    changeRoom: z.boolean(),
    skipIdDocument: z.boolean(),
    swapGuest: z.boolean(),
  }),
})
export type CheckInPrepare = z.infer<typeof checkInPrepareSchema>

export const idDocumentChoiceSchema = z.discriminatedUnion('kind', [
  // Uploaded with registrations.uploadIdDocument (from the camera or a scan), this check-in's.
  z.object({ kind: z.literal('uploaded'), documentId: idSchema }),
  // A returning guest's earlier, unexpired document.
  z.object({ kind: z.literal('reuse'), documentId: idSchema }),
  // A GM skips it with a reason (guest.id_skip); the stay shows "ID photo to add".
  z.object({ kind: z.literal('skip'), reason: z.string().trim().min(3).max(200) }),
  // The rule set doesn't ask for one.
  z.object({ kind: z.literal('none') }),
])
export type IdDocumentChoice = z.infer<typeof idDocumentChoiceSchema>

const registrations = z
  .array(registrationInputSchema)
  .min(1)
  .max(6)
  .refine((list) => list[0]?.lead === true && list.slice(1).every((r) => !r.lead), {
    message: 'The lead guest comes first',
  })

export const checkInInputSchema = z.object({
  // Made when the sheet opened: a retry, or an offline resend, returns the first result.
  idempotencyKey: z.uuidv7(),
  stayId: idSchema,
  version: z.number().int().min(1),
  // The room to check into: the assigned one, or another of the booked type (assigned here).
  roomId: idSchema,
  // Someone else is staying: the stay's guest becomes this one (the booker stays on the booking).
  guest: guestChoiceSchema.optional(),
  registrations,
  idDocument: idDocumentChoiceSchema,
  printCard: z.boolean().default(true),
  // The device's time and business date (an offline check-in syncs later).
  occurredAt: z.iso.datetime(),
  businessDate: calendarDateSchema,
  durationSeconds: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600),
  source: z.enum(CHECK_IN_SOURCES).default('arrivals'),
})
export type CheckInInput = z.input<typeof checkInInputSchema>

export const checkedInSchema = z.object({
  stayId: idSchema,
  reservationId: idSchema,
  number: z.string(),
  guestName: z.string(),
  version: z.number().int(),
  room: z.object({ id: idSchema, number: z.string() }),
  roomNotReady: z.boolean(),
  checkedInAt: z.iso.datetime(),
  byName: z.string(),
  registrations: z.array(registrationViewSchema),
  // A link to the registration card PDF (5 minutes), when asked to print.
  cardUrl: z.string().nullable(),
})
export type CheckedIn = z.infer<typeof checkedInSchema>

export const REVERSE_REASONS = ['wrong_guest', 'wrong_booking', 'guest_left', 'other'] as const
export type ReverseReason = (typeof REVERSE_REASONS)[number]
export const REVERSE_REASON_LABELS: Record<ReverseReason, string> = {
  wrong_guest: 'Wrong guest',
  wrong_booking: 'Wrong booking',
  guest_left: 'Guest left at once',
  other: 'Other',
}

export const undoCheckInInputSchema = z.object({
  idempotencyKey: z.uuidv7(),
  stayId: idSchema,
  version: z.number().int().min(1),
})

export const reverseCheckInInputSchema = z
  .object({
    idempotencyKey: z.uuidv7(),
    stayId: idSchema,
    version: z.number().int().min(1),
    reason: z.enum(REVERSE_REASONS),
    reasonText: z.string().trim().max(200).optional(),
  })
  .refine((input) => input.reason !== 'other' || Boolean(input.reasonText), {
    message: 'Say why, in a few words',
    path: ['reasonText'],
  })

export const checkInUndoneSchema = z.object({
  stayId: idSchema,
  reservationId: idSchema,
  guestName: z.string(),
  version: z.number().int(),
})

// --- Walk-in -------------------------------------------------------------------------------------

export const walkInOptionsInputSchema = z.object({
  propertyId: idSchema,
  departure: calendarDateSchema,
  adults: z.number().int().min(1).max(12),
  children: z.number().int().min(0).max(12),
})

export const walkInOptionsSchema = z.object({
  arrival: calendarDateSchema,
  departure: calendarDateSchema,
  // Per active room type: rooms free for every night, ready first (Inspected, Clean, then Dirty).
  types: z.array(
    z.object({
      roomTypeId: idSchema,
      rooms: z.array(roomOptionSchema),
      ready: z.number().int(),
    }),
  ),
  basePlanId: idSchema.nullable(),
})
export type WalkInOptions = z.infer<typeof walkInOptionsSchema>

export const walkInInputSchema = z.object({
  // The booking exactly as reservations.create takes it (one stay, arriving on the business date,
  // with the room picked); its source is recorded as walk_in. An approval for a discount over the
  // limit is on the stay, as on a booking.
  booking: createReservationSchema,
  registrations,
  idDocument: idDocumentChoiceSchema,
  printCard: z.boolean().default(true),
  durationSeconds: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600),
})
export type WalkInInput = z.input<typeof walkInInputSchema>

// --- Registrations -------------------------------------------------------------------------------

export const revealInputSchema = z.object({
  registrationId: idSchema,
  which: z.enum(['id', 'visa']),
  reason: z.string().trim().min(3, 'Say why, in a few words').max(200),
})

export const revealedSchema = z.object({
  number: z.string(),
  idType: idTypeSchema.nullable(),
  // Shown for this long, then masked again.
  seconds: z.number().int(),
})

export const uploadIdDocumentInputSchema = z.object({
  // Made on the device, so a resend (or an offline sync) stores the file once.
  documentId: z.uuidv7(),
  propertyId: idSchema,
  contentType: z.enum(ID_DOCUMENT_TYPES),
  source: z.enum(['camera', 'upload', 'offline']).default('camera'),
  // The file, base64 (≤ 5 MB once decoded).
  data: z.string().min(16).max(7_200_000),
})

export const idDocumentSchema = z.object({
  id: idSchema,
  contentType: z.string(),
  byteSize: z.number().int(),
  capturedAt: z.iso.datetime(),
})
export type IdDocument = z.infer<typeof idDocumentSchema>

export const viewIdDocumentInputSchema = z.object({
  registrationId: idSchema,
  reason: z.string().trim().min(3, 'Say why, in a few words').max(200),
})

export const correctRegistrationInputSchema = z.object({
  idempotencyKey: z.uuidv7(),
  registrationId: idSchema,
  values: registrationInputSchema,
})

export const attachIdDocumentInputSchema = z.object({
  registrationId: idSchema,
  documentId: idSchema,
})

export const stayRegistrationsSchema = z.object({
  stayId: idSchema,
  registrations: z.array(registrationViewSchema),
  can: z.object({ correct: z.boolean(), viewId: z.boolean(), print: z.boolean() }),
})
export type StayRegistrations = z.infer<typeof stayRegistrationsSchema>

export const frontDeskContract = {
  frontDesk: {
    list: oc.input(frontDeskListInputSchema).output(frontDeskListSchema),
    hotels: oc.input(z.object({}).optional()).output(z.array(frontDeskHotelSchema)),
  },
  checkIn: {
    prepare: oc.input(z.object({ stayId: idSchema })).output(checkInPrepareSchema),
    checkIn: oc.input(checkInInputSchema).output(checkedInSchema),
    undo: oc.input(undoCheckInInputSchema).output(checkInUndoneSchema),
    reverse: oc.input(reverseCheckInInputSchema).output(checkInUndoneSchema),
  },
  walkIn: {
    options: oc.input(walkInOptionsInputSchema).output(walkInOptionsSchema),
    checkIn: oc.input(walkInInputSchema).output(checkedInSchema),
  },
  registrations: {
    get: oc.input(z.object({ stayId: idSchema })).output(stayRegistrationsSchema),
    correct: oc.input(correctRegistrationInputSchema).output(registrationViewSchema),
    reveal: oc.input(revealInputSchema).output(revealedSchema),
    uploadIdDocument: oc.input(uploadIdDocumentInputSchema).output(idDocumentSchema),
    viewIdDocument: oc
      .input(viewIdDocumentInputSchema)
      .output(z.object({ url: z.string(), contentType: z.string(), expiresInSeconds: z.number() })),
    attachIdDocument: oc.input(attachIdDocumentInputSchema).output(registrationViewSchema),
  },
  documents: {
    registrationCard: oc
      .input(z.object({ stayId: idSchema }))
      .output(z.object({ url: z.string(), copy: z.number().int() })),
  },
  ruleSets: {
    // The registration rules in force at a hotel (the sheet and the walk-in page read them).
    current: oc.input(z.object({ propertyId: idSchema })).output(ruleSetSchema),
  },
}
