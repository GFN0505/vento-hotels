// The room sheet's form: values as typed, checks on save, and what changed for the update.
import { type ConnectingRoom, floorSchema, type RoomDetail, roomNumberSchema } from '@vento/shared'

export type RoomForm = {
  number: string
  floor: string
  roomTypeId: string
  features: string[]
  accessible: boolean
  connecting: ConnectingRoom[]
  reason: string
}

export const FIELD_ORDER = ['number', 'floor', 'reason']

export function formFrom(room: RoomDetail | undefined, defaults: { typeId: string }): RoomForm {
  return {
    number: room?.number ?? '',
    floor: room ? String(room.floor) : '',
    roomTypeId: room?.roomTypeId ?? defaults.typeId,
    features: room?.features ?? [],
    accessible: room?.accessible ?? false,
    connecting: room?.connectingRooms ?? [],
    reason: '',
  }
}

export function numberProblem(value: string) {
  if (!value.trim()) return 'Enter the room number'
  const result = roomNumberSchema.safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message
}

export function floorProblem(value: string) {
  if (!/^-?\d{1,3}$/.test(value.trim())) return 'Enter the floor as a number, 0 for ground'
  const result = floorSchema.safeParse(Number(value))
  return result.success ? undefined : result.error.issues[0]?.message
}

// Only what changed, so the audit log shows exactly that.
export function changes(room: RoomDetail, form: RoomForm, live: boolean) {
  const number = form.number.trim().toUpperCase()
  const floor = Number(form.floor)
  const ids = form.connecting.map((r) => r.id).sort()
  const before = room.connectingRooms.map((r) => r.id).sort()
  const typeChanged = form.roomTypeId !== room.roomTypeId
  return {
    id: room.id,
    ...(number !== room.number ? { number } : {}),
    ...(floor !== room.floor ? { floor } : {}),
    ...(typeChanged ? { roomTypeId: form.roomTypeId } : {}),
    ...(JSON.stringify(form.features) !== JSON.stringify(room.features)
      ? { features: form.features }
      : {}),
    ...(form.accessible !== room.accessible ? { accessible: form.accessible } : {}),
    ...(JSON.stringify(ids) !== JSON.stringify(before) ? { connectingRoomIds: ids } : {}),
    ...(typeChanged && live ? { reason: form.reason.trim() } : {}),
  }
}
