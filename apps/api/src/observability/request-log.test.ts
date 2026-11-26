import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { currentRequest } from './request-context.ts'
import { requestLog } from './request-log.ts'

function app() {
  const hono = new Hono()
  hono.use(requestLog())
  hono.get('/who', (c) => c.json({ requestId: currentRequest()?.requestId }))
  return hono
}

describe('requestLog', () => {
  it('gives every request an id, returned in the header and known while handling it', async () => {
    const response = await app().request('/who')
    const id = response.headers.get('x-request-id')
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await response.json()).toEqual({ requestId: id })
  })

  it("keeps a proxy's request id only when it looks like one", async () => {
    const kept = await app().request('/who', { headers: { 'x-request-id': 'edge-1234abcd' } })
    expect(kept.headers.get('x-request-id')).toBe('edge-1234abcd')
    const replaced = await app().request('/who', { headers: { 'x-request-id': '<script>' } })
    expect(replaced.headers.get('x-request-id')).not.toBe('<script>')
  })
})
