// Errors with the spec's wording and a `data.code` the web app can react to.
import { ORPCError } from '@orpc/server'

export const roomNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that room" })

export const roomTypeNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that room type" })

function listOf(numbers: readonly string[]): string {
  if (numbers.length === 1) return `Room ${numbers[0]}`
  const shown = numbers.slice(0, 3)
  const more = numbers.length - shown.length
  return more > 0
    ? `Rooms ${shown.join(', ')} and ${more} more`
    : `Rooms ${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
}

// Numbers the hotel already has. One archived number gets the "restore it" advice.
export function numbersTaken(taken: readonly { number: string; archived: boolean }[]) {
  const numbers = taken.map((t) => t.number)
  const [only] = taken
  if (taken.length === 1 && only?.archived) {
    return new ORPCError('CONFLICT', {
      message: `Room ${only.number} is archived. Restore it, or delete it for good if it was a mistake.`,
      data: { code: 'ROOM_ARCHIVED', numbers },
    })
  }
  return new ORPCError('CONFLICT', {
    message: `${listOf(numbers)} already ${numbers.length === 1 ? 'exists' : 'exist'}.`,
    data: { code: 'ROOM_NUMBER_TAKEN', numbers },
  })
}

export function duplicateNumbers(numbers: readonly string[]) {
  return new ORPCError('BAD_REQUEST', {
    message: `${listOf(numbers)} ${numbers.length === 1 ? 'is' : 'are'} in the list twice.`,
    data: { code: 'DUPLICATE_NUMBERS', numbers },
  })
}

export function roomArchived(number: string) {
  return new ORPCError('CONFLICT', {
    message: `Room ${number} is archived. Restore it first.`,
    data: { code: 'ROOM_ARCHIVED', numbers: [number] },
  })
}

export function typeArchived(name: string) {
  return new ORPCError('CONFLICT', {
    message: `${name} is archived. Restore it first.`,
    data: { code: 'TYPE_ARCHIVED' },
  })
}

export function typeNameTaken(name: string) {
  return new ORPCError('CONFLICT', {
    message: `${name} already exists at this hotel.`,
    data: { code: 'TYPE_NAME_TAKEN' },
  })
}

export function typeCodeTaken(code: string, usedBy: { name: string; archived: boolean }) {
  return new ORPCError('CONFLICT', {
    message: usedBy.archived
      ? `Code ${code} is used by ${usedBy.name}, which is archived.`
      : `Code ${code} is used by ${usedBy.name}.`,
    data: { code: 'TYPE_CODE_TAKEN' },
  })
}

export function typeHasRooms(name: string, rooms: number) {
  return new ORPCError('CONFLICT', {
    message:
      rooms === 1
        ? `Move or remove the 1 ${name} room first.`
        : `Move or remove the ${rooms} ${name} rooms first.`,
    data: { code: 'TYPE_HAS_ROOMS', rooms },
  })
}
