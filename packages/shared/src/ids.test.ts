import { describe, expect, it } from 'vitest'
import { idSchema, newId } from './ids.ts'

describe('newId', () => {
  it('generates valid UUID v7 ids', () => {
    const id = newId()
    expect(idSchema.safeParse(id).success).toBe(true)
    expect(id[14]).toBe('7')
  })

  it('sorts ids in creation order', () => {
    const ids = Array.from({ length: 50 }, () => newId())
    expect([...ids].sort()).toEqual(ids)
  })

  it('never repeats', () => {
    expect(new Set(Array.from({ length: 10_000 }, () => newId())).size).toBe(10_000)
  })
})

describe('idSchema', () => {
  it('rejects other UUID versions and junk', () => {
    expect(idSchema.safeParse('3b241101-e2bb-4255-8caf-4136c566a962').success).toBe(false) // v4
    expect(idSchema.safeParse('not-an-id').success).toBe(false)
  })
})
