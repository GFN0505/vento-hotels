// Implements the shared contract. Middleware runs in order: who is asking (session), which
// organization (from the session, never from input), then which properties they may see.
import { implement, ORPCError } from '@orpc/server'
import { contract } from '@vento/shared'
import type { Auth } from './auth/auth.ts'
import type { Database } from './db/client.ts'
import * as governance from './governance/service.ts'
import type { EmailProvider } from './providers/email.ts'
import { clientAddress, type RateLimiter } from './rate-limit.ts'
import type { HealthCheck } from './system/health.ts'
import * as invitations from './team/invitations.ts'
import * as team from './team/members.ts'
import { loadAccess } from './tenancy/access.ts'
import * as tenancy from './tenancy/service.ts'

export type AppDeps = {
  checkHealth: HealthCheck
  db: Database
  auth: Auth
  email: EmailProvider
  // The address people open in the browser, for links in emails.
  webOrigin: string
  limiter: RateLimiter
  // Every module on, released or not: development and browser tests only (decision 0021).
  allFeatures?: boolean
}
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
  const access = await loadAccess(context.db, organizationId, context.user, {
    allFeatures: context.allFeatures ?? false,
  })
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
      team.setMemberAccess(context.db, context.access, input),
    ),
    list: inOrganization.members.list.handler(({ context, input }) =>
      team.listMembers(context.db, context.access, input),
    ),
    update: inOrganization.members.update.handler(({ context, input }) =>
      team.updateMember(context.db, context.access, input),
    ),
    remove: inOrganization.members.remove.handler(({ context, input }) =>
      team.removeMember(context.db, context.access, input.memberId),
    ),
  },
  invitations: {
    list: inOrganization.invitations.list.handler(({ context, input }) =>
      invitations.listInvitations(context.db, context.access, input),
    ),
    // Up to 100 invite emails per person per hour, so an account can't be used to spam.
    create: inOrganization.invitations.create.handler(({ context, input }) => {
      context.limiter.take(`invite:${context.access.memberId}`, 100, 3600, input.emails.length)
      return invitations.createInvitations(context, context.access, input)
    }),
    resend: inOrganization.invitations.resend.handler(({ context, input }) => {
      context.limiter.take(`invite:${context.access.memberId}`, 100, 3600)
      return invitations.resendInvitation(context, context.access, input.id)
    }),
    cancel: inOrganization.invitations.cancel.handler(({ context, input }) =>
      invitations.cancelInvitation(context.db, context.access, input.id),
    ),
    // Public: the secret in the link is the credential (decision 0020).
    preview: base.invitations.preview.handler(({ context, input }) => {
      context.limiter.take(`invite-preview:${clientAddress(context.headers)}`, 60, 600)
      return invitations.previewInvitation(context.db, input.token)
    }),
    join: base.invitations.join.handler(({ context, input }) => {
      context.limiter.take(`invite-join:${clientAddress(context.headers)}`, 15, 600)
      return invitations.joinWithInvitation(context.db, input)
    }),
    accept: authed.invitations.accept.handler(({ context, input }) =>
      invitations.acceptInvitation(context.db, context.user, input.token),
    ),
  },
  audit: {
    list: inOrganization.audit.list.handler(({ context, input }) =>
      governance.listAudit(context.db, context.access, input),
    ),
  },
  permissions: {
    list: inOrganization.permissions.list.handler(({ context }) =>
      governance.listPermissions(context.db, context.access),
    ),
    set: inOrganization.permissions.set.handler(({ context, input }) =>
      governance.setPermission(context.db, context.access, input),
    ),
  },
})
export type Router = typeof router
