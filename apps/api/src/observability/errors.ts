// Error tracking (Sentry) for problems people shouldn't hit: crashes and 5xx answers, never the
// ordinary "wrong password" or "not allowed". Off unless SENTRY_DSN is set. No personal data leaves:
// reports carry the request and organization ids, never names, emails, bodies or cookies.
import * as Sentry from '@sentry/node'
import { logger } from './log.ts'
import { currentRequest } from './request-context.ts'

let enabled = false

export function startErrorTracking(options: { dsn?: string | undefined; environment: string }) {
  if (!options.dsn) return
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    // Collect nothing about people or what they sent; beforeSend strips anything that slips in.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.user
      if (event.request) {
        delete event.request.cookies
        delete event.request.data
        delete event.request.headers
        delete event.request.query_string
      }
      return event
    },
  })
  enabled = true
}

// Logs the problem with the request's ids and sends it to error tracking when that's on.
export function reportError(error: unknown, where: string) {
  const request = currentRequest()
  logger.error({ err: error, where }, 'Something failed')
  if (!enabled) return
  Sentry.withScope((scope) => {
    scope.setTag('where', where)
    if (request) {
      scope.setTag('requestId', request.requestId)
      if (request.organizationId) scope.setTag('organizationId', request.organizationId)
      if (request.propertyId) scope.setTag('propertyId', request.propertyId)
    }
    Sentry.captureException(error)
  })
}

export async function flushErrorTracking() {
  if (enabled) await Sentry.flush(2000)
}
