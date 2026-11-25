// The HTTP app: /health for monitors, /api/auth/* for sign-in (Better Auth), /rpc for the typed API.
import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'
import { type AppDeps, router } from './router.ts'

export function createApp(deps: AppDeps) {
  const app = new Hono()
  const rpc = new RPCHandler(router)

  // 200 when the database and storage are reachable, 503 otherwise. Never includes credentials.
  app.get('/health', async (c) => {
    const health = await deps.checkHealth()
    return c.json(health, health.status === 'ok' ? 200 : 503)
  })

  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw))

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
