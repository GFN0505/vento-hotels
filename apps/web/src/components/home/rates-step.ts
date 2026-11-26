// The "Set rates" setup step's rule, kept apart from React so it's unit-tested.
type ByHotel = { propertyId: string; rooms: number; ratesSet: boolean }[]

// Done when every hotel with rooms has a plan pricing all its room types. Its link
// opens the hotel in view if it still needs rates, else the first one that does.
export function ratesStep(byHotel: ByHotel, currentId: string | undefined) {
  const withRooms = byHotel.filter((row) => row.rooms > 0)
  const missing = withRooms.filter((row) => !row.ratesSet)
  const here = missing.find((row) => row.propertyId === currentId)
  return {
    done: withRooms.length > 0 && missing.length === 0,
    hotel: (here ?? missing[0])?.propertyId ?? currentId,
  }
}
