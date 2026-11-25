// Implements the shared contract. Middleware runs in order: who is asking (session), which
// organization (from the session, never from input), then which properties they may see.
import { implement, ORPCError } from '@orpc/server'
import { contract } from '@vento/shared'
import type { Auth } from './auth/auth.ts'
import type { Database } from './db/client.ts'
import type { HealthCheck } from './system/health.ts'
import { loadAccess } from './tenancy/access.ts'
import * as tenancy from './tenancy/service.ts'

export type AppDeps = { checkHealth: HealthCheck; db: Database; auth: Auth }
export type RequestContext = AppDeps & { headers: Headers }

const base = implement(contract).$context<RequestContext>()

const authed = base.use(async ({ context, next }) => {
  const result = await context.auth.api.getSession({ headers: context.headers })
  if (!result) throw new ORPCError('UNAUTHORIZED', { message: 'Sign in to continue' })
  return next({ context: { user: result.user, session: result.session } })
})

const inOrganization = authed.use(async ({ context, next }) => {
  const organizationId = context.session.activeOrganizationId
  if (!organizationId) {
    throw new ORPCError('FORBIDDEN', { message: 'Choose an organization first' })
  }
  const access = await loadAccess(context.db, organizationId, context.user.id)
  if (!access) throw new ORPCError('FORBIDDEN', { message: "You don't have access to this" })
  return next({ context: { access } })
})

export const router = base.router({
  system: {
    health: base.system.health.handler(({ context }) => context.checkHealth()),
  },
  organization: {
    current: inOrganization.organization.current.handler(({ context }) =>
      tenancy.currentOrganization(context.db, context.access),
    ),
  },
  entities: {
    list: inOrganization.entities.list.handler(({ context, input }) =>
      tenancy.listEntities(context.db, context.access, input),
    ),
    create: inOrganization.entities.create.handler(({ context, input }) =>
      tenancy.createEntity(context.db, context.access, input),
    ),
  },
  properties: {
    list: inOrganization.properties.list.handler(({ context, input }) =>
      tenancy.listProperties(context.db, context.access, input),
    ),
    get: inOrganization.properties.get.handler(({ context, input }) =>
      tenancy.getProperty(context.db, context.access, input.id),
    ),
    create: inOrganization.properties.create.handler(({ context, input }) =>
      tenancy.createProperty(context.db, context.access, input),
    ),
  },
  members: {
    setPropertyAccess: inOrganization.members.setPropertyAccess.handler(({ context, input }) =>
      tenancy.setPropertyAccess(context.db, context.access, input),
    ),
  },
})
export type Router = typeof router
