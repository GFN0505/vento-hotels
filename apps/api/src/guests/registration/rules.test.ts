// The rule set in force: Vento's starting rules, a group's override for a state and for one hotel.
import { requiredFields } from '@vento/shared'
import { describe, expect, it } from 'vitest'

const set = {
  rules: [
    {
      audience: 'all' as const,
      field: 'address' as const,
      required: true,
      source: 's',
      verified: false,
    },
    {
      audience: 'all' as const,
      field: 'id_document' as const,
      required: true,
      source: 's',
      verified: false,
    },
    {
      audience: 'foreign' as const,
      field: 'next_destination' as const,
      required: true,
      source: 's',
      verified: false,
    },
    {
      audience: 'foreign' as const,
      field: 'visa_number' as const,
      required: true,
      source: 's',
      verified: false,
    },
    {
      audience: 'all' as const,
      field: 'vehicle_plate' as const,
      required: false,
      source: 's',
      verified: false,
    },
  ],
}

describe('requiredFields', () => {
  it('asks the lead guest for every audience that applies', () => {
    expect(requiredFields(set, { nationality: 'NG', lead: true }).sort()).toEqual(
      ['address', 'id_document', 'name', 'nationality'].sort(),
    )
    expect(requiredFields(set, { nationality: 'FR', lead: true })).toEqual(
      expect.arrayContaining(['address', 'next_destination', 'visa_number']),
    )
  })

  it('registers other Nigerian adults by name, foreign ones with the foreign national fields', () => {
    expect(requiredFields(set, { nationality: 'NG', lead: false }).sort()).toEqual(
      ['name', 'nationality'].sort(),
    )
    expect(requiredFields(set, { nationality: 'GB', lead: false })).toEqual(
      expect.arrayContaining(['next_destination']),
    )
    expect(requiredFields(set, { nationality: 'GB', lead: false })).not.toContain('address')
  })
})
