import { describe, expect, it } from 'vitest'
import { FEATURE_KEYS, FEATURES, featuresOn } from './features.ts'

describe('feature switches', () => {
  it('starts with every module unreleased', () => {
    expect(FEATURE_KEYS).toHaveLength(10)
    expect(Object.values(FEATURES).every((f) => !f.released)).toBe(true)
    expect(featuresOn(new Map())).toEqual([])
  })

  it("uses a group's own switch over the catalog", () => {
    expect(featuresOn(new Map([['front_desk', true]]))).toEqual(['front_desk'])
  })

  it('turns everything on for development and tests', () => {
    expect(featuresOn(new Map([['front_desk', false]]), true)).toEqual(FEATURE_KEYS)
  })
})
