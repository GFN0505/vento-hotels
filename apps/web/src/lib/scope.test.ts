import { describe, expect, it } from 'vitest'
import {
  hotelGoneReason,
  keepWithinHotel,
  lostHotel,
  nextAnnouncement,
  propertyIdOf,
  resolveHotelLink,
  scopedTitle,
  scopeName,
  scopePropertyId,
  titleForRoute,
} from './scope'

const abuja = { id: '0193a000-0000-7000-8000-000000000003', name: 'Kora Abuja' }
const ikeja = { id: '0193a000-0000-7000-8000-000000000002', name: 'Kora Ikeja GRA' }
const hotels = [ikeja, abuja]
const keyFor = (propertyId?: string) => [
  ['members', 'list'],
  { input: { pageSize: 25, ...(propertyId ? { propertyId } : {}) }, type: 'query' },
]

describe('resolveHotelLink', () => {
  it('selects a hotel the person can open', () => {
    expect(resolveHotelLink(abuja.id, hotels, false)).toEqual({ kind: 'hotel', id: abuja.id })
  })

  it('selects All hotels only for people who have it', () => {
    expect(resolveHotelLink('all', hotels, true)).toEqual({ kind: 'all' })
    expect(resolveHotelLink('all', hotels, false)).toEqual({ kind: 'refused' })
  })

  it('refuses an unknown hotel and one outside access the same way', () => {
    expect(resolveHotelLink('0193a000-0000-7000-8000-000000000009', hotels, true)).toEqual({
      kind: 'refused',
    })
    expect(resolveHotelLink('not-an-id', hotels, true)).toEqual({ kind: 'refused' })
  })
})

describe('scope names and titles', () => {
  it('names one hotel, or All hotels', () => {
    expect(scopeName({ kind: 'hotel', hotel: abuja as never })).toBe('Kora Abuja')
    expect(scopeName({ kind: 'all' })).toBe('All hotels')
  })

  it('sends a hotel id only when one hotel is chosen', () => {
    expect(scopePropertyId({ kind: 'hotel', hotel: abuja as never })).toBe(abuja.id)
    expect(scopePropertyId({ kind: 'all' })).toBeUndefined()
    expect(scopePropertyId(undefined)).toBeUndefined()
  })

  it('puts the page first, then the scope, then the product', () => {
    expect(scopedTitle('Members and roles', 'Kora Abuja')).toBe(
      'Members and roles · Kora Abuja · Vento Hotels',
    )
    expect(scopedTitle('Devices', undefined)).toBe('Devices · Vento Hotels')
  })
})

describe('keepWithinHotel', () => {
  const rows = { items: ['Chiamaka Eze'] }

  it('keeps the previous page while paging within the same hotel', () => {
    expect(keepWithinHotel(abuja.id)(rows, { queryKey: keyFor(abuja.id) })).toBe(rows)
    expect(keepWithinHotel(undefined)(rows, { queryKey: keyFor() })).toBe(rows)
  })

  it("never shows another hotel's rows under the new hotel's name", () => {
    expect(keepWithinHotel(abuja.id)(rows, { queryKey: keyFor(ikeja.id) })).toBeUndefined()
    expect(keepWithinHotel(abuja.id)(rows, { queryKey: keyFor() })).toBeUndefined()
    expect(keepWithinHotel(undefined)(rows, { queryKey: keyFor(ikeja.id) })).toBeUndefined()
  })

  it('reads the hotel from an oRPC query key', () => {
    expect(propertyIdOf({ queryKey: keyFor(abuja.id) })).toBe(abuja.id)
    expect(propertyIdOf({ queryKey: [['properties', 'list']] })).toBeUndefined()
  })
})

describe('hotelGoneReason', () => {
  it('tells an archived hotel from one outside access, by the API code', () => {
    expect(hotelGoneReason({ status: 404, data: { code: 'PROPERTY_ARCHIVED' } })).toBe('archived')
    expect(hotelGoneReason({ status: 404, data: { code: 'PROPERTY_NOT_FOUND' } })).toBe('removed')
  })

  it('ignores other failures, whatever their wording', () => {
    expect(hotelGoneReason({ status: 404, message: "We couldn't find that hotel" })).toBeUndefined()
    expect(hotelGoneReason({ status: 0, message: 'Failed to fetch' })).toBeUndefined()
    expect(hotelGoneReason(undefined)).toBeUndefined()
  })
})

describe('lostHotel', () => {
  it('names the hotel on screen when it leaves the list', () => {
    expect(lostHotel(hotels, [ikeja], abuja.id)).toEqual(abuja)
  })

  it('says nothing on the first load, with All hotels, or when the hotel is still there', () => {
    expect(lostHotel([], [ikeja], abuja.id)).toBeUndefined()
    expect(lostHotel(hotels, [ikeja], undefined)).toBeUndefined()
    expect(lostHotel(hotels, hotels, abuja.id)).toBeUndefined()
  })

  it('says nothing while the list is empty (failed to load), or for a hotel it never had', () => {
    expect(lostHotel(hotels, [], abuja.id)).toBeUndefined()
    expect(lostHotel([ikeja], [ikeja], abuja.id)).toBeUndefined()
  })
})

describe('titleForRoute', () => {
  const abujaScope = { kind: 'hotel', hotel: abuja } as never

  it('names the page and the hotel in view as soon as navigation starts', () => {
    expect(titleForRoute({ title: 'Devices' }, abujaScope, 'Kora Hotels Group')).toBe(
      'Devices · Kora Abuja · Vento Hotels',
    )
    expect(titleForRoute({ title: 'Devices' }, { kind: 'all' }, 'Kora Hotels Group')).toBe(
      'Devices · All hotels · Vento Hotels',
    )
  })

  it('names the group on group-wide pages, and leaves pages without a title alone', () => {
    expect(
      titleForRoute(
        { title: 'Permissions and limits', groupWide: true },
        abujaScope,
        'Kora Hotels Group',
      ),
    ).toBe('Permissions and limits · Kora Hotels Group · Vento Hotels')
    expect(titleForRoute({}, abujaScope, 'Kora Hotels Group')).toBeUndefined()
    expect(titleForRoute(undefined, abujaScope, 'Kora Hotels Group')).toBeUndefined()
  })
})

describe('nextAnnouncement', () => {
  it('says new text as it is', () => {
    expect(nextAnnouncement('', 'Showing Kora Abuja')).toBe('Showing Kora Abuja')
    expect(nextAnnouncement('Showing Kora Abuja', 'Showing all hotels')).toBe('Showing all hotels')
  })

  it('changes the text when the same thing is said twice, so it is announced again', () => {
    const once = nextAnnouncement('', 'Showing Kora Abuja')
    const twice = nextAnnouncement(once, 'Showing Kora Abuja')
    const thrice = nextAnnouncement(twice, 'Showing Kora Abuja')
    expect(twice).not.toBe(once)
    expect(thrice).not.toBe(twice)
    expect(twice.trim().replace('\u200B', '')).toBe('Showing Kora Abuja')
  })
})
