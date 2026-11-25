import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { pageOffset, pageQuerySchema, pageSchema, toPage } from './pagination.ts'

describe('pageQuerySchema', () => {
  it('defaults to the first page of 25', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 })
  })

  it('accepts query-string values', () => {
    expect(pageQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 })
  })

  it('refuses page 0, fractions and pages over 100 rows', () => {
    for (const bad of [{ page: 0 }, { page: 1.5 }, { pageSize: 101 }, { pageSize: 0 }]) {
      expect(pageQuerySchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('pages', () => {
  it('computes the offset', () => {
    expect(pageOffset({ page: 1, pageSize: 25 })).toBe(0)
    expect(pageOffset({ page: 3, pageSize: 25 })).toBe(50)
  })

  it('builds and validates the shared page shape', () => {
    const page = toPage([{ room: '502' }], 120, { page: 2, pageSize: 1 })
    const schema = pageSchema(z.object({ room: z.string() }))
    expect(schema.parse(page)).toEqual({
      items: [{ room: '502' }],
      page: 2,
      pageSize: 1,
      total: 120,
    })
  })
})
