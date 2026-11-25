// Implements the shared contract. Each module adds its procedures here as it is built.
// From brick 5 the context carries the session, organization and property scope.
import { implement } from '@orpc/server'
import { contract } from '@vento/shared'
import type { HealthCheck } from './system/health.ts'

export type AppContext = { checkHealth: HealthCheck }

const os = implement(contract).$context<AppContext>()

export const router = os.router({
  system: {
    health: os.system.health.handler(({ context }) => context.checkHealth()),
  },
})
export type Router = typeof router
