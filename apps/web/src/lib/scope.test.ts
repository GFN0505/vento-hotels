import { describe, expect, it } from 'vitest'
import {
  isHotelGone,
  keepWithinHotel,
  propertyIdOf,
  resolveHotelLink,
  scopedTitle,
  scopeName,
  scopePropertyId,
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

describe('isHotelGone', () => {
  it('recognises a hotel outside access or archived', () => {
    expect(isHotelGone({ status: 404, message: "We couldn't find that hotel" })).toBe(true)
    expect(
      isHotelGone({
        status: 404,
        message: 'This hotel was archived.',
        data: { code: 'PROPERTY_ARCHIVED' },
      }),
    ).toBe(true)
  })

  it('ignores other failures', () => {
    expect(isHotelGone({ status: 404, message: "We couldn't find that person" })).toBe(false)
    expect(isHotelGone({ status: 0, message: 'Failed to fetch' })).toBe(false)
    expect(isHotelGone(undefined)).toBe(false)
  })
})
