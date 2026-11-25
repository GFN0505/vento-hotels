import { describe, expect, it } from 'vitest'
import { isConnectionProblem } from './errors'

describe('isConnectionProblem', () => {
  it('is not a problem when the request worked', () => {
    expect(isConnectionProblem(null)).toBe(false)
    expect(isConnectionProblem(undefined)).toBe(false)
  })

  it('is a problem when Vento could not be reached or failed', () => {
    expect(isConnectionProblem({ status: 0 })).toBe(true)
    expect(isConnectionProblem({})).toBe(true)
    expect(isConnectionProblem({ status: 500 })).toBe(true)
    expect(isConnectionProblem({ status: 503 })).toBe(true)
  })

  it('leaves answers about the details to the form', () => {
    expect(isConnectionProblem({ status: 400 })).toBe(false)
    expect(isConnectionProblem({ status: 401 })).toBe(false)
    expect(isConnectionProblem({ status: 429 })).toBe(false)
  })
})
