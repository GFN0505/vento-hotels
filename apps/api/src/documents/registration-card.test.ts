// The registration card from fixture data (printing skill: snapshot the text, not the bytes).
import type { RegistrationCardData } from '@vento/shared'
import { registrationCardTerms } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { registrationCardText, renderRegistrationCard } from './registration-card.ts'

const card = (extra: Partial<RegistrationCardData> = {}): RegistrationCardData => ({
  hotel: {
    name: 'Kora Victoria Island',
    company: 'Kora Hospitality Ltd · RC 1184402 · TIN 21847390-0001',
    address: 'Plot 1412 Ahmadu Bello Way, Victoria Island, Eti-Osa, Lagos',
    phone: null,
  },
  cardNumber: 'RC-VI-26-000147',
  bookingNumber: 'VI-2611-0482',
  copy: 1,
  guest: [
    { label: 'Full name', value: 'Mr Daniel Mensah' },
    { label: 'Nationality', value: 'Ghanaian' },
    { label: 'ID', value: 'Passport G0••••12' },
  ],
  stay: [
    { label: 'Room', value: '502 · Executive King' },
    {
      label: 'Rate',
      value:
        '₦180,000.00 per night, excl. 10% Service charge, 7.5% VAT and 5% Lagos consumption tax · room only',
    },
  ],
  foreign: [
    { label: 'Passport number', value: 'G0••••12 · Ghana' },
    { label: 'Visa or permit', value: 'Not required · ECOWAS citizen' },
    { label: 'Next destination', value: 'Accra' },
  ],
  companions: [],
  terms: registrationCardTerms('12:00'),
  checkedInBy: 'Chiamaka Eze',
  businessDate: '2026-11-25',
  printedLine: 'Printed 25 Nov 2026 11:36 by Chiamaka Eze · FD-VI-01',
  ...extra,
})

describe('registration card', () => {
  it('prints the foreign national section, masked numbers and the NDPA line', () => {
    const text = registrationCardText(card())
    expect(text).toContain('No. RC-VI-26-000147')
    expect(text).toContain('Passport number: G0••••12 · Ghana')
    expect(text).toContain('3 · Foreign national')
    expect(text.join('\n')).toContain('Nigeria Data Protection Act 2023')
    expect(text).not.toContain('REPRINT · copy 2')
  })

  it('says REPRINT on a later copy and leaves the foreign section out for a Nigerian', () => {
    const text = registrationCardText(card({ copy: 2, foreign: null }))
    expect(text).toContain('REPRINT · copy 2')
    expect(text).not.toContain('3 · Foreign national')
  })

  it('renders a PDF with the ₦ font', async () => {
    const pdf = await renderRegistrationCard(card({ companions: ['Ama Mensah · Ghanaian'] }))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(2000)
  })
})
