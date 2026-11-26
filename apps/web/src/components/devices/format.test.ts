import { describe, expect, it } from 'vitest'
import { exampleName, hotelCode } from './format'

describe('device name examples', () => {
  it('makes a short code from the hotel name, without the group brand', () => {
    expect(hotelCode('Kora Abuja')).toBe('ABJ')
    expect(hotelCode('Kora Victoria Island')).toBe('VI')
    expect(hotelCode('Kora Port Harcourt')).toBe('PH')
    expect(hotelCode('Lekki')).toBe('LKK')
  })

  it('suggests a name from what the device is for and where it is', () => {
    expect(exampleName('front_desk', 'Kora Abuja')).toBe('e.g. FD-ABJ-01')
    expect(exampleName('pos', undefined)).toBe('e.g. POS-VI-01')
  })
})
