import type { Entity } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import {
  checkCompany,
  companyDirty,
  companyForm,
  createInput,
  hotelsLine,
  storedAs,
  updateInput,
} from './company-form-model'

function company(overrides: Partial<Entity> = {}): Entity {
  return {
    id: '0193a000-0000-7000-8000-000000000001',
    name: 'Kora Hospitality Ltd',
    rcNumber: 'RC 1184402',
    tin: '21847390-0001',
    vatRegistered: true,
    pendingVat: null,
    baseCurrency: 'NGN',
    status: 'active',
    version: 2,
    hotels: [{ id: '0193a000-0000-7000-8000-0000000000aa', name: 'Kora Victoria Island' }],
    otherHotels: 0,
    canEdit: true,
    ownsLiveHotel: false,
    ...overrides,
  }
}

describe('the company form', () => {
  it('needs only a legal name; RC number and TIN are checked when given', () => {
    expect(checkCompany({ ...companyForm(), name: 'K' })).toEqual({
      name: 'Enter at least 2 characters',
    })
    const form = { ...companyForm(), name: 'Kora PH Ltd', rcNumber: 'AB 12', tin: '12-34' }
    expect(checkCompany(form)).toEqual({
      rcNumber: 'Use a CAC number like RC 1184402 or BN 3456789',
      tin: 'Use 8 to 14 digits, like 21847390-0001',
    })
  })

  it('shows how an RC number will be stored', () => {
    const normalize = (v: string) => (v === '1377281' ? 'RC 1377281' : v)
    expect(storedAs('1377281', normalize)).toBe('Saved as RC 1377281')
    expect(storedAs('RC 1377281', normalize)).toBeUndefined()
    expect(storedAs('', normalize)).toBeUndefined()
  })

  it('leaves out an empty RC number and TIN for a new company', () => {
    expect(createInput({ ...companyForm(), name: ' Kora PH Ltd ' })).toEqual({
      name: 'Kora PH Ltd',
      vatRegistered: false,
    })
  })

  it('sends only what changed, and clears an emptied TIN', () => {
    const before = company()
    expect(updateInput(before, { ...companyForm(before), rcNumber: 'rc-1184402' })).toEqual({
      id: before.id,
      version: 2,
    })
    expect(updateInput(before, { ...companyForm(before), tin: '' })).toEqual({
      id: before.id,
      version: 2,
      tin: null,
    })
  })

  it('asks why a TIN or VAT registration changes once a hotel it owns is live', () => {
    const live = company({ ownsLiveHotel: true })
    const form = { ...companyForm(live), vatRegistered: false }
    expect(checkCompany(form, live)).toEqual({ reason: 'Say why, in a few words' })
    expect(updateInput(live, { ...form, reason: 'Deregistered' })).toMatchObject({
      vatRegistered: false,
      reason: 'Deregistered',
    })
    expect(checkCompany({ ...companyForm(live), name: 'Kora Hospitality Limited' }, live)).toEqual(
      {},
    )
  })

  it('knows when nothing changed', () => {
    expect(companyDirty(companyForm(company()), company())).toBe(false)
    expect(companyDirty({ ...companyForm(company()), vatRegistered: false }, company())).toBe(true)
  })
})

describe('a waiting VAT change', () => {
  const waiting = company({
    ownsLiveHotel: true,
    pendingVat: { vatRegistered: false, from: '2026-11-27' },
  })

  it('shows the value it is heading for', () => {
    expect(companyForm(waiting).vatRegistered).toBe(false)
    expect(companyDirty(companyForm(waiting), waiting)).toBe(false)
  })

  it('is cancelled by choosing the current value again, with a reason', () => {
    const form = { ...companyForm(waiting), vatRegistered: true }
    expect(checkCompany(form, waiting)).toEqual({ reason: 'Say why, in a few words' })
    expect(updateInput(waiting, { ...form, reason: 'Registered after all' })).toEqual({
      id: waiting.id,
      version: 2,
      vatRegistered: true,
      reason: 'Registered after all',
    })
  })
})

describe('hotelsLine', () => {
  it('names the hotels it owns, and counts the ones outside your access', () => {
    expect(hotelsLine(company())).toBe('Kora Victoria Island')
    expect(hotelsLine(company({ otherHotels: 1 }))).toBe('Kora Victoria Island + 1 other hotel')
    expect(hotelsLine(company({ hotels: [], otherHotels: 2 }))).toBe('2 other hotels')
    expect(hotelsLine(company({ hotels: [] }))).toBe('No hotels')
  })
})
