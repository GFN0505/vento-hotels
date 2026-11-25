import { describe, expect, it } from 'vitest'
import { CANT_REACH_VENTO, isConnectionProblem, problemMessage } from './errors'

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

describe('problemMessage', () => {
  it("shows the API's words for problems with the request", () => {
    expect(problemMessage({ status: 403, message: "You don't have access to this" })).toBe(
      "You don't have access to this",
    )
  })

  it('shows the connection message for anything else', () => {
    expect(problemMessage(new TypeError('Failed to fetch'))).toBe(CANT_REACH_VENTO)
    expect(problemMessage({ status: 500, message: 'Internal server error' })).toBe(CANT_REACH_VENTO)
  })
})
