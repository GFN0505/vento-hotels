import type { Property } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { archiveSummary, timeZoneLabel } from './format'
import {
  changesFrom,
  checkChanges,
  checkNew,
  emptyForm,
  formFrom,
  isDirty,
  needsReason,
} from './hotel-form-model'

const HOSPITALITY = '0193a000-0000-7000-8000-000000000001'
const ABUJA_LTD = '0193a000-0000-7000-8000-000000000002'

function hotel(overrides: Partial<Property> = {}): Property {
  return {
    id: '0193a000-0000-7000-8000-0000000000aa',
    entityId: HOSPITALITY,
    entityName: 'Kora Hospitality Ltd',
    entityDetailsMissing: false,
    pendingEntity: null,
    name: 'Kora Victoria Island',
    addressLine1: 'Plot 1412 Ahmadu Bello Way',
    area: 'Victoria Island',
    lga: 'Eti-Osa',
    state: 'Lagos',
    country: 'NG',
    timeZone: 'Africa/Lagos',
    checkInTime: '14:00',
    checkOutTime: '12:00',
    businessDate: '2026-11-25',
    liveSince: null,
    status: 'setting_up',
    archivedAt: null,
    logo: null,
    roomCount: 0,
    version: 3,
    ...overrides,
  }
}

describe('a new hotel', () => {
  it('needs a name, the full address and a company', () => {
    const problems = checkNew(emptyForm(HOSPITALITY))
    expect(problems).toMatchObject({
      name: 'Enter at least 2 characters',
      addressLine1: 'Enter the street',
      area: 'Enter the area',
      state: 'Choose a state',
    })
  })

  it('refuses an LGA from another state', () => {
    const form = {
      ...emptyForm(HOSPITALITY),
      name: 'Kora Lekki',
      addressLine1: 'Plot 7 Admiralty Way',
      area: 'Lekki Phase 1',
      state: 'Rivers',
      lga: 'Eti-Osa',
    }
    expect(checkNew(form)).toEqual({ lga: 'Choose an LGA in this state' })
    expect(checkNew({ ...form, state: 'Lagos' })).toEqual({})
  })
})

describe('hotel settings', () => {
  it('sends only what changed, trimmed', () => {
    const before = hotel()
    const form = { ...formFrom(before), checkOutTime: '11:00', area: ' Victoria Island ' }
    expect(changesFrom(before, form)).toEqual({ checkOutTime: '11:00' })
    expect(isDirty(before, formFrom(before))).toBe(false)
  })

  it("lets onboarding's hotel save with its address still empty", () => {
    const before = hotel({ addressLine1: null, area: null, lga: null })
    const form = { ...formFrom(before), checkInTime: '15:00' }
    expect(checkChanges(before, form)).toEqual({})
    expect(changesFrom(before, form)).toEqual({ checkInTime: '15:00' })
  })

  it('never clears an address once it is set', () => {
    const before = hotel()
    const form = { ...formFrom(before), addressLine1: '' }
    expect(isDirty(before, form)).toBe(true)
    expect(checkChanges(before, form)).toEqual({ addressLine1: 'Enter the street' })
  })

  it('asks a live hotel why it moves to another company, and schedules it', () => {
    const live = hotel({ liveSince: '2026-11-15', status: 'live' })
    const form = { ...formFrom(live), entityId: ABUJA_LTD }
    expect(needsReason(live, form)).toBe(true)
    expect(checkChanges(live, form)).toEqual({ reason: 'Say why, in a few words' })
    expect(changesFrom(live, { ...form, reason: ' Transfer to new company ' })).toEqual({
      entityId: ABUJA_LTD,
      reason: 'Transfer to new company',
    })
  })

  it('moves a hotel that is still setting up at once, with no reason', () => {
    const before = hotel()
    expect(needsReason(before, { ...formFrom(before), entityId: ABUJA_LTD })).toBe(false)
  })

  it('cancels a scheduled change when the current company is chosen again, with a reason', () => {
    const live = hotel({
      liveSince: '2026-11-15',
      status: 'live',
      pendingEntity: { id: ABUJA_LTD, name: 'Kora Hotels Abuja Ltd', from: '2026-11-26' },
    })
    const form = { ...formFrom(live), entityId: HOSPITALITY }
    expect(formFrom(live).entityId).toBe(ABUJA_LTD)
    expect(needsReason(live, form)).toBe(true)
    expect(changesFrom(live, { ...form, reason: 'Transfer called off' })).toEqual({
      entityId: HOSPITALITY,
      reason: 'Transfer called off',
    })
  })
})

describe('archiveSummary', () => {
  it('says what is kept and what stops, leaving out what does not apply', () => {
    expect(
      archiveSummary({
        rooms: 72,
        devices: 3,
        peopleOnlyHere: 4,
        invitationsOnlyHere: 0,
        lastHotel: false,
        blockers: [],
      }),
    ).toEqual([
      'It leaves the hotel switch and every list.',
      'Its 72 rooms, history and reports are kept.',
      '3 devices are signed out and revoked.',
      '4 people work only here and will have no hotel until you give them another.',
    ])
  })

  it('speaks of one device and one person in the singular', () => {
    const lines = archiveSummary({
      rooms: 1,
      devices: 1,
      peopleOnlyHere: 1,
      invitationsOnlyHere: 1,
      lastHotel: false,
      blockers: [],
    })
    expect(lines).toContain('Its 1 room, history and reports are kept.')
    expect(lines).toContain('1 device is signed out and revoked.')
    expect(lines).toContain('1 invite for this hotel alone is cancelled.')
  })
})

describe('timeZoneLabel', () => {
  it('names Lagos time as people say it', () => {
    expect(timeZoneLabel('Africa/Lagos')).toBe('Africa/Lagos · WAT')
  })
})
