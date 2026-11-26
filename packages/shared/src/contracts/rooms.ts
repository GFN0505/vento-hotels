// Room types and rooms, per property (spec: docs/specs/stage-1-room-types-and-rooms.md). Every
// procedure needs the front_desk feature and the rooms.setup permission. No input carries an
// organizationId: the API takes it from the session.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { idSchema } from '../ids.ts'
import { MAX_PAGE_SIZE, pageQuerySchema, pageSchema } from '../pagination.ts'
import {
  chipListSchema,
  floorSchema,
  frontOfficeStatusSchema,
  housekeepingStatusSchema,
  MAX_ROOMS_PER_BATCH,
  roomBedSchema,
  roomNumberSchema,
  roomTypeCodeSchema,
} from '../rooms.ts'

// `data.code` on CONFLICT, BAD_REQUEST and FORBIDDEN errors from these procedures, so the web app
// can react (e.g. put the message under the right field). The message is always fit to show.
export const ROOM_ERROR_CODES = [
  'ROOM_NUMBER_TAKEN', // data.numbers: string[]
  'ROOM_ARCHIVED', // data.numbers: string[]
  'TYPE_NAME_TAKEN',
  'TYPE_CODE_TAKEN',
  'TYPE_HAS_ROOMS', // data.rooms: number
  'TYPE_ARCHIVED',
  'HAS_HISTORY',
  'NOT_ARCHIVED',
  'PROPERTY_LIVE',
  'REASON_REQUIRED',
  'DUPLICATE_NUMBERS', // data.numbers: string[]
  'LIST_CHANGED',
  'FEATURE_OFF',
] as const
export type RoomErrorCode = (typeof ROOM_ERROR_CODES)[number]

// Required after go-live for archive, restore and type changes; ignored before.
const reason = z.string().trim().min(3, 'Say why, in a few words').max(500).optional()
const ids = z
  .array(idSchema)
  .min(1, 'Choose at least one room')
  .max(MAX_ROOMS_PER_BATCH, `Up to ${MAX_ROOMS_PER_BATCH} rooms at a time`)

// --- Room types -----------------------------------------------------------------------------------

export const roomTypeViewSchema = z.object({
  id: idSchema,
  propertyId: idSchema,
  code: z.string(),
  name: z.string(),
  bed: roomBedSchema,
  sofaBed: z.boolean(),
  baseOccupancy: z.number().int(),
  maxAdults: z.number().int(),
  maxChildren: z.number().int(),
  // Max adults + max children.
  maxGuests: z.number().int(),
  // Square metres as a decimal string, e.g. "32.0".
  sizeSqm: z.string().nullable(),
  amenities: z.array(z.string()),
  sortOrder: z.number().int(),
  // Active rooms of this type; never typed.
  roomCount: z.number().int(),
  archivedAt: z.iso.datetime().nullable(),
})
export type RoomTypeView = z.infer<typeof roomTypeViewSchema>

const sizeSqm = z
  .string()
  .trim()
  .regex(/^\d{1,4}(\.\d)?$/, 'Enter the size in m², like 32 or 32.5')
  .refine((value) => Number.parseFloat(value) > 0, 'Enter a size above 0')

const roomTypeFields = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60, 'Keep the name under 60 characters'),
  code: roomTypeCodeSchema,
  bed: roomBedSchema,
  sofaBed: z.boolean().default(false),
  baseOccupancy: z.number().int().min(1, 'At least 1 guest').max(20).default(2),
  maxAdults: z.number().int().min(1, 'At least 1 adult').max(20).default(2),
  maxChildren: z.number().int().min(0).max(20).default(0),
  sizeSqm: sizeSqm.nullable().default(null),
  amenities: chipListSchema.default([]),
})

const occupancyFits = (v: { baseOccupancy: number; maxAdults: number; maxChildren: number }) =>
  v.baseOccupancy <= v.maxAdults + v.maxChildren

export const createRoomTypeSchema = roomTypeFields
  .extend({ propertyId: idSchema })
  .refine(occupancyFits, {
    path: ['baseOccupancy'],
    message: "Base occupancy can't be more than max guests",
  })

// Only the fields sent change. The API checks base occupancy against the merged values.
export const updateRoomTypeSchema = z.object({
  id: idSchema,
  name: roomTypeFields.shape.name.optional(),
  code: roomTypeCodeSchema.optional(),
  bed: roomBedSchema.optional(),
  sofaBed: z.boolean().optional(),
  baseOccupancy: z.number().int().min(1).max(20).optional(),
  maxAdults: z.number().int().min(1).max(20).optional(),
  maxChildren: z.number().int().min(0).max(20).optional(),
  sizeSqm: sizeSqm.nullable().optional(),
  amenities: chipListSchema.optional(),
})

export const listRoomTypesSchema = pageQuerySchema.extend({
  propertyId: idSchema,
  includeArchived: z.boolean().default(false),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(MAX_PAGE_SIZE),
})

// --- Rooms ----------------------------------------------------------------------------------------

export const connectingRoomSchema = z.object({ id: idSchema, number: z.string() })

export const roomViewSchema = z.object({
  id: idSchema,
  propertyId: idSchema,
  number: z.string(),
  floor: z.number().int(),
  roomTypeId: idSchema,
  roomTypeName: z.string(),
  roomTypeCode: z.string(),
  features: z.array(z.string()),
  accessible: z.boolean(),
  connectingRooms: z.array(connectingRoomSchema),
  frontOfficeStatus: frontOfficeStatusSchema,
  housekeepingStatus: housekeepingStatusSchema,
  archivedAt: z.iso.datetime().nullable(),
})
export type RoomView = z.infer<typeof roomViewSchema>

export const roomDetailSchema = roomViewSchema.extend({
  // Archived and no history, so "Delete for good" can be offered.
  canDelete: z.boolean(),
})
export type RoomDetail = z.infer<typeof roomDetailSchema>

// Sorted by floor, then number (naturally: 1014 before 1101). 100 per page by default.
export const listRoomsSchema = pageQuerySchema.extend({
  propertyId: idSchema,
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(MAX_PAGE_SIZE),
  q: z.string().trim().max(20).optional(),
  roomTypeId: idSchema.optional(),
  floor: z.coerce.number().int().optional(),
  accessible: z.boolean().optional(),
  // true: archived rooms only; otherwise active rooms only.
  archived: z.boolean().optional(),
  outOfOrder: z.boolean().optional(),
})

export const roomsSummarySchema = z.object({
  active: z.number().int(),
  archived: z.number().int(),
  accessible: z.number().int(),
  outOfOrder: z.number().int(),
  // Floors with active rooms, ascending.
  floors: z.array(z.number().int()),
  // The hotel's own features, for suggestions.
  features: z.array(z.string()),
  // Show the "Mark N inspected" banner: not live yet, and every active room is still dirty.
  allDirtySetup: z.boolean(),
  // The property has completed its first night audit (properties.live_since is set).
  live: z.boolean(),
})
export type RoomsSummary = z.infer<typeof roomsSummarySchema>

const connectingRoomIds = z.array(idSchema).max(4, 'Up to 4 connecting rooms')

export const createRoomSchema = z.object({
  propertyId: idSchema,
  number: roomNumberSchema,
  floor: floorSchema,
  roomTypeId: idSchema,
  features: chipListSchema.default([]),
  accessible: z.boolean().default(false),
  connectingRoomIds: connectingRoomIds.default([]),
})

export const checkNumbersSchema = z.object({
  propertyId: idSchema,
  numbers: z.array(roomNumberSchema).min(1).max(MAX_ROOMS_PER_BATCH),
})
export const checkNumbersResultSchema = z.object({
  taken: z.array(z.object({ number: z.string(), archived: z.boolean() })),
})

export const createManyRoomsSchema = z.object({
  propertyId: idSchema,
  // A UUID v7 from the browser, recorded on every room.created event of this go.
  batchId: idSchema,
  rooms: z
    .array(z.object({ number: roomNumberSchema, floor: floorSchema, roomTypeId: idSchema }))
    .min(1, 'Add at least one room')
    .max(MAX_ROOMS_PER_BATCH, `Up to ${MAX_ROOMS_PER_BATCH} rooms in one go`),
})

export const updateRoomSchema = z.object({
  id: idSchema,
  number: roomNumberSchema.optional(),
  floor: floorSchema.optional(),
  roomTypeId: idSchema.optional(),
  features: chipListSchema.optional(),
  accessible: z.boolean().optional(),
  // The full set; replaces the current connections on both sides.
  connectingRoomIds: connectingRoomIds.optional(),
  reason,
})

const count = z.object({ count: z.number().int() })
const ok = z.object({ ok: z.literal(true) })

export const roomsContract = {
  roomTypes: {
    list: oc.input(listRoomTypesSchema).output(pageSchema(roomTypeViewSchema)),
    get: oc.input(z.object({ id: idSchema })).output(roomTypeViewSchema),
    create: oc.input(createRoomTypeSchema).output(roomTypeViewSchema),
    update: oc.input(updateRoomTypeSchema).output(roomTypeViewSchema),
    // Only with no active rooms (TYPE_HAS_ROOMS).
    archive: oc.input(z.object({ id: idSchema, reason })).output(roomTypeViewSchema),
    restore: oc.input(z.object({ id: idSchema, reason })).output(roomTypeViewSchema),
    // `ids` is every active type of the property, in the new order (LIST_CHANGED otherwise).
    reorder: oc
      .input(z.object({ propertyId: idSchema, ids: z.array(idSchema).min(1).max(MAX_PAGE_SIZE) }))
      .output(ok),
  },
  rooms: {
    list: oc.input(listRoomsSchema).output(pageSchema(roomViewSchema)),
    summary: oc.input(z.object({ propertyId: idSchema })).output(roomsSummarySchema),
    get: oc.input(z.object({ id: idSchema })).output(roomDetailSchema),
    create: oc.input(createRoomSchema).output(roomDetailSchema),
    // Which of these numbers the hotel already has, archived included (the builder's preview).
    checkNumbers: oc.input(checkNumbersSchema).output(checkNumbersResultSchema),
    // All or nothing, in one transaction.
    createMany: oc
      .input(createManyRoomsSchema)
      .output(z.object({ created: z.number().int(), batchId: idSchema })),
    update: oc.input(updateRoomSchema).output(roomDetailSchema),
    changeType: oc
      .input(z.object({ propertyId: idSchema, ids, roomTypeId: idSchema, reason }))
      .output(count),
    archive: oc.input(z.object({ propertyId: idSchema, ids, reason })).output(count),
    restore: oc.input(z.object({ propertyId: idSchema, ids, reason })).output(count),
    // Archived rooms with no history only; frees the number.
    delete: oc.input(z.object({ id: idSchema })).output(ok),
    // Before go-live only: every dirty active room becomes inspected.
    markInspected: oc
      .input(z.object({ propertyId: idSchema }))
      .output(z.object({ count: z.number().int(), batchId: idSchema })),
    undoMarkInspected: oc
      .input(z.object({ propertyId: idSchema, batchId: idSchema }))
      .output(count),
  },
}
