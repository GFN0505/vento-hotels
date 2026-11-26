// Implements the shared contract. Middleware runs in order: who is asking (session), which
// organization (from the session, never from input), then which properties they may see.
import { implement, ORPCError } from '@orpc/server'
import { contract } from '@vento/shared'
import type { Auth } from './auth/auth.ts'
import type { Database } from './db/client.ts'
import * as devices from './devices/service.ts'
import { guardDeviceSession } from './devices/session-guard.ts'
import * as governance from './governance/service.ts'
import { noteOrganization } from './observability/request-context.ts'
import type { EmailProvider } from './providers/email.ts'
import { clientAddress, type RateLimiter } from './rate-limit.ts'
import * as inspected from './rooms/inspected.ts'
import * as roomBatch from './rooms/room-batch.ts'
import * as roomBulk from './rooms/room-bulk.ts'
import * as roomReads from './rooms/room-reads.ts'
import * as roomTypes from './rooms/room-types.ts'
import * as roomWrites from './rooms/room-writes.ts'
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
export type RequestContext = AppDeps & { headers: Headers; resHeaders?: Headers }

const base = implement(contract).$context<RequestContext>()

const authed = base.use(async ({ context, next }) => {
  const result = await context.auth.api.getSession({ headers: context.headers })
  if (!result) throw new ORPCError('UNAUTHORIZED', { message: 'Sign in to continue' })
  // PIN sessions on shared devices: idle time, shift length and device cookie, checked here.
  const { deviceId } = result.session as { deviceId?: string | null }
  if (deviceId) {
    await guardDeviceSession(
      context.db,
      { id: result.session.id, createdAt: new Date(result.session.createdAt), deviceId },
      context.headers,
    )
  }
  return next({ context: { user: result.user, session: result.session } })
})

const inOrganization = authed.use(async ({ context, next }) => {
  const organizationId = context.session.activeOrganizationId
  if (!organizationId) {
    throw new ORPCError('FORBIDDEN', { message: 'Choose an organization first' })
  }
  const access = await loadAccess(context.db, organizationId, context.user, {
    allFeatures: context.allFeatures ?? false,
    deviceId: (context.session as { deviceId?: string | null }).deviceId ?? null,
  })
  if (!access) throw new ORPCError('FORBIDDEN', { message: "You don't have access to this" })
  noteOrganization(organizationId)
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
    home: inOrganization.organization.home.handler(({ context }) =>
      tenancy.homeSummary(context.db, context.access),
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
  devices: {
    list: inOrganization.devices.list.handler(({ context, input }) =>
      devices.listDevices(context.db, context.access, input, context.headers),
    ),
    register: inOrganization.devices.register.handler(async ({ context, input }) => {
      const { device, secret } = await devices.registerDevice(context.db, context.access, input)
      context.resHeaders?.append(
        'set-cookie',
        devices.deviceCookie(secret, context.webOrigin.startsWith('https://')),
      )
      return device
    }),
    rename: inOrganization.devices.rename.handler(({ context, input }) =>
      devices.renameDevice(context.db, context.access, input),
    ),
    revoke: inOrganization.devices.revoke.handler(({ context, input }) =>
      devices.revokeDevice(context.db, context.access, input),
    ),
    // Public: reads this browser's device cookie, if any.
    lockScreen: base.devices.lockScreen.handler(({ context }) => {
      context.limiter.take(`lock-screen:${clientAddress(context.headers)}`, 120, 600)
      return devices.lockScreen(context.db, context.headers)
    }),
  },
  pins: {
    // The password check here mustn't become a way round sign-in's attempt limit.
    set: inOrganization.pins.set.handler(({ context, input }) => {
      context.limiter.take(`pin-set:${context.access.userId}`, 5, 600)
      return devices.setOwnPin(context.db, context.access, input)
    }),
    reset: inOrganization.pins.reset.handler(({ context, input }) =>
      devices.resetPin(context.db, context.access, input.memberId),
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
  roomTypes: {
    list: inOrganization.roomTypes.list.handler(({ context, input }) =>
      roomTypes.listRoomTypes(context.db, context.access, input),
    ),
    get: inOrganization.roomTypes.get.handler(({ context, input }) =>
      roomTypes.getRoomType(context.db, context.access, input.id),
    ),
    create: inOrganization.roomTypes.create.handler(({ context, input }) =>
      roomTypes.createRoomType(context.db, context.access, input),
    ),
    update: inOrganization.roomTypes.update.handler(({ context, input }) =>
      roomTypes.updateRoomType(context.db, context.access, input),
    ),
    archive: inOrganization.roomTypes.archive.handler(({ context, input }) =>
      roomTypes.archiveRoomType(context.db, context.access, input),
    ),
    restore: inOrganization.roomTypes.restore.handler(({ context, input }) =>
      roomTypes.restoreRoomType(context.db, context.access, input),
    ),
    reorder: inOrganization.roomTypes.reorder.handler(({ context, input }) =>
      roomTypes.reorderRoomTypes(context.db, context.access, input),
    ),
  },
  rooms: {
    list: inOrganization.rooms.list.handler(({ context, input }) =>
      roomReads.listRooms(context.db, context.access, input),
    ),
    listIds: inOrganization.rooms.listIds.handler(({ context, input }) =>
      roomReads.listRoomIds(context.db, context.access, input),
    ),
    summary: inOrganization.rooms.summary.handler(({ context, input }) =>
      roomReads.roomsSummary(context.db, context.access, input),
    ),
    get: inOrganization.rooms.get.handler(({ context, input }) =>
      roomReads.getRoom(context.db, context.access, input.id),
    ),
    checkNumbers: inOrganization.rooms.checkNumbers.handler(({ context, input }) =>
      roomReads.checkNumbers(context.db, context.access, input),
    ),
    create: inOrganization.rooms.create.handler(({ context, input }) =>
      roomWrites.createRoom(context.db, context.access, input),
    ),
    createMany: inOrganization.rooms.createMany.handler(({ context, input }) =>
      roomBatch.createManyRooms(context.db, context.access, input),
    ),
    update: inOrganization.rooms.update.handler(({ context, input }) =>
      roomWrites.updateRoom(context.db, context.access, input),
    ),
    delete: inOrganization.rooms.delete.handler(({ context, input }) =>
      roomWrites.deleteRoom(context.db, context.access, input),
    ),
    changeType: inOrganization.rooms.changeType.handler(({ context, input }) =>
      roomBulk.changeRoomType(context.db, context.access, input),
    ),
    archive: inOrganization.rooms.archive.handler(({ context, input }) =>
      roomBulk.archiveRooms(context.db, context.access, input),
    ),
    restore: inOrganization.rooms.restore.handler(({ context, input }) =>
      roomBulk.restoreRooms(context.db, context.access, input),
    ),
    markInspected: inOrganization.rooms.markInspected.handler(({ context, input }) =>
      inspected.markInspected(context.db, context.access, input),
    ),
    undoMarkInspected: inOrganization.rooms.undoMarkInspected.handler(({ context, input }) =>
      inspected.undoMarkInspected(context.db, context.access, input),
    ),
  },
})
export type Router = typeof router
