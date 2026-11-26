// The demo group's room types and rooms (spec: docs/specs/stage-1-room-types-and-rooms.md, "Demo
// seed"). Kora Victoria Island matches the designs and walkthroughs exactly; the other three hotels
// use the same four types in simple floor blocks. 382 rooms across the group, all vacant and
// inspected, with their audit events as if the owner had set them up.
import { expandFloorLines, type FloorLine, newId, type RoomBed } from '@vento/shared'
import { type Actor, type AuditEvent, recordAuditMany } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { roomConnections, rooms, roomTypes } from '../db/schema/rooms.ts'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Code = 'STQ' | 'DLK' | 'EXK' | 'JRS'

const TYPES: {
  code: Code
  name: string
  bed: RoomBed
  sofaBed: boolean
  baseOccupancy: number
  maxAdults: number
  maxChildren: number
  sizeSqm: string
  amenities: string[]
}[] = [
  {
    code: 'STQ',
    name: 'Standard Queen',
    bed: 'queen',
    sofaBed: false,
    baseOccupancy: 2,
    maxAdults: 2,
    maxChildren: 0,
    sizeSqm: '24.0',
    amenities: ['AC', 'Wi-Fi', 'Smart TV', 'Kettle'],
  },
  {
    code: 'DLK',
    name: 'Deluxe King',
    bed: 'king',
    sofaBed: false,
    baseOccupancy: 2,
    maxAdults: 2,
    maxChildren: 1,
    sizeSqm: '32.0',
    amenities: ['AC', 'Wi-Fi', 'Smart TV', 'Work desk', 'Kettle', 'Safe', 'Minibar'],
  },
  {
    code: 'EXK',
    name: 'Executive King',
    bed: 'king',
    sofaBed: false,
    baseOccupancy: 2,
    maxAdults: 2,
    maxChildren: 1,
    sizeSqm: '40.0',
    amenities: ['AC', 'Wi-Fi', 'Smart TV', 'Work desk', 'Kettle', 'Safe', 'Minibar', 'Bathtub'],
  },
  {
    code: 'JRS',
    name: 'Junior Suite',
    bed: 'king',
    sofaBed: true,
    baseOccupancy: 2,
    maxAdults: 3,
    maxChildren: 1,
    sizeSqm: '58.0',
    amenities: ['AC', 'Wi-Fi', 'Smart TV', 'Work desk', 'Kettle', 'Safe', 'Minibar', 'Lounge'],
  },
]

const line = (
  roomType: Code,
  floorFrom: number,
  floorTo: number,
  from = 1,
  to = 14,
): FloorLine => ({
  roomType,
  floorFrom,
  floorTo,
  numberFrom: from,
  numberTo: to,
})

export type RoomHotel = 'vi' | 'ikeja' | 'abuja' | 'ph'

export const ROOM_LAYOUT: Record<RoomHotel, FloorLine[]> = {
  // 120 rooms: 14 per floor on floors 3–10, 8 suites on floor 11; floors 7–10 mixed.
  vi: [
    line('STQ', 3, 3),
    line('STQ', 7, 7),
    line('STQ', 8, 8, 1, 8),
    line('DLK', 4, 4),
    line('DLK', 8, 8, 9, 14),
    line('DLK', 9, 10),
    line('EXK', 5, 6),
    line('JRS', 11, 11, 1, 8),
  ],
  ikeja: [line('STQ', 1, 2), line('DLK', 3, 4), line('EXK', 5, 6), line('JRS', 7, 7, 1, 2)],
  abuja: [line('STQ', 1, 2), line('DLK', 3, 5), line('EXK', 6, 7), line('JRS', 8, 8, 1, 6)],
  ph: [line('STQ', 1, 2), line('DLK', 3, 4), line('EXK', 5, 5), line('JRS', 6, 6, 1, 2)],
}

// Features and accessible rooms from the designs (RoomsManage, AuditOnRoom, the walkthroughs).
const VI_FEATURES: Record<string, string[]> = {
  '401': ['City view'],
  '406': ['City view'],
  '407': ['Roll-in shower'],
  '412': ['Near lift'],
  '1102': ['Ocean view', 'Bathtub'],
  '502': ['Quiet side'],
}
const VI_ACCESSIBLE = new Set(['307', '407', '507', '901'])

type Hotel = { id: string; businessDate: string }

export async function seedRooms(
  tx: Tx,
  actor: Actor,
  organizationId: string,
  hotels: Record<RoomHotel, Hotel>,
): Promise<number> {
  let total = 0
  for (const [key, hotel] of Object.entries(hotels) as [RoomHotel, Hotel][]) {
    const at = { propertyId: hotel.id, businessDate: hotel.businessDate }
    const typeIds = {} as Record<Code, string>
    const events: AuditEvent[] = []
    for (const [index, type] of TYPES.entries()) {
      typeIds[type.code] = newId()
      await tx.insert(roomTypes).values({
        id: typeIds[type.code],
        organizationId,
        propertyId: hotel.id,
        sortOrder: index + 1,
        ...type,
      })
      events.push({
        action: 'room_type.created',
        entityType: 'room_type',
        entityId: typeIds[type.code],
        ...at,
        after: { ...type, liveProperty: false },
      })
    }

    const batchId = newId()
    const planned = expandFloorLines(ROOM_LAYOUT[key]).rooms
    const vi = key === 'vi'
    const values = planned.map((room) => ({
      id: newId(),
      organizationId,
      propertyId: hotel.id,
      roomTypeId: typeIds[room.roomType as Code],
      number: room.number,
      floor: room.floor,
      features: vi ? (VI_FEATURES[room.number] ?? []) : [],
      accessible: vi && VI_ACCESSIBLE.has(room.number),
      housekeepingStatus: 'inspected' as const,
    }))
    await tx.insert(rooms).values(values)
    for (const room of values) {
      events.push({
        action: 'room.created',
        entityType: 'room',
        entityId: room.id,
        ...at,
        after: {
          number: room.number,
          floor: room.floor,
          roomTypeId: room.roomTypeId,
          roomTypeName: TYPES.find((type) => typeIds[type.code] === room.roomTypeId)?.name,
          batchId,
          liveProperty: false,
        },
      })
    }
    if (vi) {
      const [roomAId, roomBId] = ['401', '402']
        .map((n) => values.find((room) => room.number === n)?.id ?? '')
        // The pair is stored once, lower id first (room_connections_ordered).
        .sort()
      if (roomAId && roomBId) {
        await tx
          .insert(roomConnections)
          .values({ organizationId, propertyId: hotel.id, roomAId, roomBId })
      }
    }
    await recordAuditMany(tx, actor, events)
    total += values.length
  }
  return total
}
