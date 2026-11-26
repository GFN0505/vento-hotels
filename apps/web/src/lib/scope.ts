// The hotel switch's rules that don't need React (spec: stage-1-hotel-switch-scope.md), kept pure
// so they're unit-tested: what a page is scoped to, how a ?hotel= link resolves, the tab title, and
// which cached rows may stay on screen while the next ones load.
import type { Property } from '@vento/shared'

// What a page shows: one hotel, or every hotel ("All hotels"). Pages read this, never `current`,
// when deciding which data to load.
export type Scope = { kind: 'hotel'; hotel: Property } | { kind: 'all' }

export const ALL_HOTELS = 'all'

export function scopeName(scope: Scope): string {
  return scope.kind === 'all' ? 'All hotels' : scope.hotel.name
}

// The hotel a list request names: one hotel's id, or none for All hotels.
export function scopePropertyId(scope: Scope | undefined): string | undefined {
  return scope?.kind === 'hotel' ? scope.hotel.id : undefined
}

// A ?hotel= link: select a hotel the person can open, or All hotels if they have it. Anything
// else (unknown, outside their access, archived, another device's hotel) is refused the same way,
// so the answer never says whether the hotel exists.
export type LinkTarget = { kind: 'all' } | { kind: 'hotel'; id: string } | { kind: 'refused' }

export function resolveHotelLink(
  param: string,
  properties: readonly Pick<Property, 'id'>[],
  canSeeAll: boolean,
): LinkTarget {
  if (param === ALL_HOTELS) return canSeeAll ? { kind: 'all' } : { kind: 'refused' }
  return properties.some((p) => p.id === param) ? { kind: 'hotel', id: param } : { kind: 'refused' }
}

// "Members and roles · Kora Abuja · Vento Hotels"; group-wide pages name the group instead.
export function scopedTitle(page: string, where: string | undefined): string {
  return [page, where, 'Vento Hotels'].filter(Boolean).join(' · ')
}

type QueryLike = { queryKey: readonly unknown[] } | undefined

// The `propertyId` an oRPC query was made with (its key is [path, { input, type }]).
export function propertyIdOf(query: QueryLike): string | undefined {
  const options = query?.queryKey[1]
  if (!options || typeof options !== 'object' || !('input' in options)) return undefined
  const input = (options as { input: unknown }).input
  if (!input || typeof input !== 'object' || !('propertyId' in input)) return undefined
  const id = (input as { propertyId: unknown }).propertyId
  return typeof id === 'string' ? id : undefined
}

// `placeholderData` for a hotel's list: keep the previous page on screen while paging or filtering
// within the same hotel, never across a hotel change (another hotel's rows under this one's name).
export function keepWithinHotel(propertyId: string | undefined) {
  return <T>(previous: T | undefined, previousQuery: QueryLike): T | undefined =>
    previousQuery && propertyIdOf(previousQuery) === propertyId ? previous : undefined
}

// A list said the hotel isn't there for this person (removed from their access, or archived since
// the switch last loaded), by the API's codes. The shell then reloads the hotel list and falls back.
export function hotelGoneReason(error: unknown): 'archived' | 'removed' | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined
  const data = (error as { data: unknown }).data
  const code =
    data && typeof data === 'object' && 'code' in data
      ? (data as { code: unknown }).code
      : undefined
  if (code === 'PROPERTY_ARCHIVED') return 'archived'
  if (code === 'PROPERTY_NOT_FOUND') return 'removed'
  return undefined
}

// The hotel that was on screen and has left the list, if any. Nothing on the first load (no list
// before), with All hotels, or when the list still has it.
export function lostHotel(
  before: readonly Pick<Property, 'id' | 'name'>[],
  after: readonly Pick<Property, 'id' | 'name'>[],
  shownId: string | undefined,
): Pick<Property, 'id' | 'name'> | undefined {
  if (before.length === 0 || after.length === 0 || !shownId) return undefined
  if (after.some((p) => p.id === shownId)) return undefined
  return before.find((p) => p.id === shownId)
}

// The tab title for a page about to open, from its route's static title, before the page itself
// mounts and refines it: group-wide pages name the group, others the hotel in view.
export function titleForRoute(
  route: { title?: string | undefined; groupWide?: boolean | undefined } | undefined,
  scope: Scope | undefined,
  groupName: string | undefined,
): string | undefined {
  if (!route?.title) return undefined
  const where = route.groupWide ? groupName : scope ? scopeName(scope) : undefined
  return scopedTitle(route.title, where)
}

// Live regions only speak when their text changes. Saying the same thing again (back to a hotel,
// then to it again) alternates an invisible suffix so it's still announced.
export function nextAnnouncement(previous: string, text: string): string {
  return previous === text ? `${text}\u200B` : text
}
