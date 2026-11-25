// The HTTP app: plain /health for load balancers and uptime checks, and /rpc for the typed API.
import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'
import { type AppContext, router } from './router.ts'

export function createApp(context: AppContext) {
  const app = new Hono()
  const rpc = new RPCHandler(router)

  // 200 when the database and storage are reachable, 503 otherwise, so a deploy or uptime monitor
  // can act on it. The body never contains connection strings or credentials.
  app.get('/health', async (c) => {
    const health = await context.checkHealth()
    return c.json(health, health.status === 'ok' ? 200 : 503)
  })

  app.use('/rpc/*', async (c, next) => {
    const { matched, response } = await rpc.handle(c.req.raw, { prefix: '/rpc', context })
    if (matched) return c.newResponse(response.body, response)
    await next()
  })

  return app
}
