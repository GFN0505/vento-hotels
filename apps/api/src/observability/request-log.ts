// One log line per request: method, path (never the query string, which can carry tokens), status
// and time taken, under a request id that is also returned in the `x-request-id` header so a
// support conversation can find the exact request.
import { newId } from '@vento/shared'
import type { MiddlewareHandler } from 'hono'
import { reportError } from './errors.ts'
import { logger } from './log.ts'
import { withRequest } from './request-context.ts'

// A request id from a trusted proxy is kept only if it looks like one; anything else is replaced.
const VALID_ID = /^[A-Za-z0-9-]{8,64}$/

export function requestLog(): MiddlewareHandler {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id')
    const requestId = incoming && VALID_ID.test(incoming) ? incoming : newId()
    const started = performance.now()
    await withRequest({ requestId }, async () => {
      try {
        await next()
      } catch (error) {
        reportError(error, 'http')
        throw error
      } finally {
        c.header('x-request-id', requestId)
        const status = c.res.status
        const line = {
          method: c.req.method,
          path: c.req.path,
          status,
          ms: Math.round(performance.now() - started),
        }
        // Health checks run every few seconds; they'd drown everything else.
        if (c.req.path === '/health' && status === 200) logger.debug(line, 'request')
        else if (status >= 500) logger.error(line, 'request')
        else logger.info(line, 'request')
      }
    })
  }
}
