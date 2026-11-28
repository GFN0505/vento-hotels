// The HTTP app: /health for monitors, /api/auth/* for sign-in (Better Auth), /rpc for the typed API.
import { ORPCError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { ResponseHeadersPlugin } from '@orpc/server/plugins'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { registrationCardResponse } from './documents/service.ts'
import { reportError } from './observability/errors.ts'
import { requestLog } from './observability/request-log.ts'
import { type AppDeps, router } from './router.ts'

export function createApp(deps: AppDeps) {
  const app = new Hono()
  app.use(requestLog())
  // Anything unexpected: reported with the request id, and a plain answer with no details.
  app.onError((error, c) => {
    reportError(error, 'http')
    return c.json({ message: 'Something went wrong on our side. Try again in a moment.' }, 500)
  })
  // ResponseHeadersPlugin lets a procedure set a cookie (the device cookie, decision 0022).
  const rpc = new RPCHandler(router, {
    plugins: [new ResponseHeadersPlugin()],
    // Errors a procedure didn't mean to send (not "not allowed" or "not found") are reported.
    clientInterceptors: [
      async ({ next }) => {
        try {
          return await next()
        } catch (error) {
          if (!(error instanceof ORPCError) || error.status >= 500) reportError(error, 'rpc')
          throw error
        }
      },
    ],
  })

  // 200 when the database and storage are reachable, 503 otherwise. Never includes credentials.
  app.get('/health', async (c) => {
    const health = await deps.checkHealth()
    return c.json(health, health.status === 'ok' ? 200 : 503)
  })

  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw))

  // The registration card PDF behind its 5-minute signed link (no session needed: the link is the
  // permission, bound to the group, hotel and stay).
  app.get('/api/files/registration-card', (c) =>
    registrationCardResponse(deps.db, deps.cardSecret, c.req.query('t')),
  )

  // No API call needs more than this; bigger bodies are refused before any work is done. An ID
  // photo or scan (5 MB, base64) is the one exception.
  const ID_UPLOAD = '/rpc/registrations/uploadIdDocument'
  app.use(
    ID_UPLOAD,
    bodyLimit({
      maxSize: 7 * 1024 * 1024 + 64 * 1024,
      onError: (c) => c.json({ message: 'That file is over 5 MB.' }, 413),
    }),
  )
  app.use('/rpc/*', async (c, next) => {
    if (c.req.path === ID_UPLOAD) return next()
    return bodyLimit({
      maxSize: 1024 * 1024,
      onError: (ctx) => ctx.json({ message: 'That request is too large' }, 413),
    })(c, next)
  })
  app.use('/rpc/*', async (c, next) => {
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: '/rpc',
      context: { ...deps, headers: c.req.raw.headers },
    })
    if (matched) return c.newResponse(response.body, response)
    await next()
  })

  return app
}
