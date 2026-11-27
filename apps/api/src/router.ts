// Implements the shared contract. Middleware runs in order: who is asking (session), which
// organization (from the session, never from input), then which properties they may see.
import { implement, ORPCError } from '@orpc/server'
import { contract } from '@vento/shared'
import * as approvals from './approvals/service.ts'
import type { Auth } from './auth/auth.ts'
import type { Database } from './db/client.ts'
import * as devices from './devices/service.ts'
import { BACKGROUND_PROCEDURES, guardDeviceSession } from './devices/session-guard.ts'
import * as bankAccounts from './finance/bank-accounts.ts'
import * as fx from './finance/fx-rates.ts'
import * as paymentMethods from './finance/payment-methods.ts'
import * as terminals from './finance/pos-terminals.ts'
import * as taxWrites from './finance/tax-writes.ts'
import * as taxes from './finance/taxes.ts'
import * as governance from './governance/service.ts'
import { noteOrganization } from './observability/request-context.ts'
import type { EmailProvider } from './providers/email.ts'
import type { StorageProvider } from './providers/storage.ts'
import { clientAddress, type RateLimiter } from './rate-limit.ts'
import * as rateCalendar from './rates/calendar.ts'
import * as firstRate from './rates/first-rate.ts'
import * as planReads from './rates/plan-reads.ts'
import * as planWrites from './rates/plan-writes.ts'
import * as rateDates from './rates/rate-dates.ts'
import { availability } from './reservations/availability.ts'
import { createReservation } from './reservations/book.ts'
import { cancelReservation, endQuote, markNoShow } from './reservations/change/end.ts'
import { modifyReservation } from './reservations/change/modify.ts'
import { quoteChange } from './reservations/change/quote-change.ts'
import { waivePenalty } from './reservations/change/waive.ts'
import { getReservation } from './reservations/detail.ts'
import { searchGuests } from './reservations/guests.ts'
import { listReservations } from './reservations/list.ts'
import { quoteReservation } from './reservations/quote.ts'
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
import * as entities from './tenancy/entities.ts'
import * as logo from './tenancy/logo.ts'
import * as hotels from './tenancy/properties.ts'
import * as hotelArchive from './tenancy/property-archive.ts'
import * as tenancy from './tenancy/service.ts'

export type AppDeps = {
  checkHealth: HealthCheck
  db: Database
  auth: Auth
  email: EmailProvider
  // Object storage for uploads (logos). Unset when the server has no storage settings: uploads
  // answer "not set up" and nothing else changes.
  storage?: StorageProvider | undefined
  // The address people open in the browser, for links in emails.
  webOrigin: string
  limiter: RateLimiter
  // Every module on, released or not: development and browser tests only (decision 0021).
  allFeatures?: boolean
}
export type RequestContext = AppDeps & { headers: Headers; resHeaders?: Headers }

const base = implement(contract).$context<RequestContext>()

const authed = base.use(async ({ context, next, path }) => {
  const result = await context.auth.api.getSession({ headers: context.headers })
  if (!result) throw new ORPCError('UNAUTHORIZED', { message: 'Sign in to continue' })
  // PIN sessions on shared devices: idle time, shift length and device cookie, checked here.
  const { deviceId } = result.session as { deviceId?: string | null }
  if (deviceId) {
    await guardDeviceSession(
      context.db,
      { id: result.session.id, createdAt: new Date(result.session.createdAt), deviceId },
      context.headers,
      { background: BACKGROUND_PROCEDURES.has(path.join('.')) },
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
      entities.listEntities(context.db, context.access, input),
    ),
    get: inOrganization.entities.get.handler(({ context, input }) =>
      entities.getEntity(context.db, context.access, input.id),
    ),
    create: inOrganization.entities.create.handler(({ context, input }) =>
      entities.createEntity(context.db, context.access, input),
    ),
    update: inOrganization.entities.update.handler(({ context, input }) =>
      entities.updateEntity(context.db, context.access, input),
    ),
    archive: inOrganization.entities.archive.handler(({ context, input }) =>
      entities.archiveEntity(context.db, context.access, input),
    ),
    restore: inOrganization.entities.restore.handler(({ context, input }) =>
      entities.restoreEntity(context.db, context.access, input),
    ),
  },
  properties: {
    list: inOrganization.properties.list.handler(({ context, input }) =>
      hotels.listProperties(context, context.access, input),
    ),
    get: inOrganization.properties.get.handler(({ context, input }) =>
      hotels.getProperty(context, context.access, input.id),
    ),
    create: inOrganization.properties.create.handler(({ context, input }) =>
      hotels.createProperty(context, context.access, input),
    ),
    update: inOrganization.properties.update.handler(({ context, input }) =>
      hotels.updateProperty(context, context.access, input),
    ),
    cancelEntityChange: inOrganization.properties.cancelEntityChange.handler(({ context, input }) =>
      hotels.cancelEntityChange(context, context.access, input),
    ),
    archivePreview: inOrganization.properties.archivePreview.handler(({ context, input }) =>
      hotelArchive.archivePreview(context, context.access, input.id),
    ),
    archive: inOrganization.properties.archive.handler(({ context, input }) =>
      hotelArchive.archiveProperty(context, context.access, input),
    ),
    restore: inOrganization.properties.restore.handler(({ context, input }) =>
      hotelArchive.restoreProperty(context, context.access, input),
    ),
    // Signing is cheap, but each URL adds a pending upload row: 60 per person per hour is plenty.
    logoUploadUrl: inOrganization.properties.logoUploadUrl.handler(({ context, input }) => {
      context.limiter.take(`logo-upload:${context.access.memberId}`, 60, 3600)
      return logo.logoUploadUrl(context, context.access, input)
    }),
    setLogo: inOrganization.properties.setLogo.handler(({ context, input }) =>
      logo.setLogo(context, context.access, input),
    ),
    removeLogo: inOrganization.properties.removeLogo.handler(({ context, input }) =>
      logo.removeLogo(context, context.access, input),
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
  ratePlans: {
    list: inOrganization.ratePlans.list.handler(({ context, input }) =>
      planReads.listRatePlans(context.db, context.access, input),
    ),
    overview: inOrganization.ratePlans.overview.handler(({ context, input }) =>
      planReads.ratesOverview(context.db, context.access, input),
    ),
    get: inOrganization.ratePlans.get.handler(({ context, input }) =>
      planReads.getRatePlan(context.db, context.access, input.id),
    ),
    history: inOrganization.ratePlans.history.handler(({ context, input }) =>
      planReads.ratePlanHistory(context.db, context.access, input.id),
    ),
    create: inOrganization.ratePlans.create.handler(({ context, input }) =>
      planWrites.createRatePlan(context.db, context.access, input),
    ),
    createFirst: inOrganization.ratePlans.createFirst.handler(({ context, input }) =>
      firstRate.createFirstRatePlans(context.db, context.access, input),
    ),
    update: inOrganization.ratePlans.update.handler(({ context, input }) =>
      planWrites.updateRatePlan(context.db, context.access, input),
    ),
    archive: inOrganization.ratePlans.archive.handler(({ context, input }) =>
      planWrites.archiveRatePlan(context.db, context.access, input),
    ),
    restore: inOrganization.ratePlans.restore.handler(({ context, input }) =>
      planWrites.restoreRatePlan(context.db, context.access, input),
    ),
    delete: inOrganization.ratePlans.delete.handler(({ context, input }) =>
      planWrites.deleteRatePlan(context.db, context.access, input),
    ),
    reorder: inOrganization.ratePlans.reorder.handler(({ context, input }) =>
      planWrites.reorderRatePlans(context.db, context.access, input),
    ),
  },
  rates: {
    calendar: inOrganization.rates.calendar.handler(({ context, input }) =>
      rateCalendar.rateCalendar(context.db, context.access, input),
    ),
    setDates: inOrganization.rates.setDates.handler(({ context, input }) =>
      rateDates.setRateDates(context.db, context.access, input),
    ),
    undoDates: inOrganization.rates.undoDates.handler(({ context, input }) =>
      rateDates.undoRateDates(context.db, context.access, input),
    ),
  },
  reservations: {
    availability: inOrganization.reservations.availability.handler(({ context, input }) =>
      availability(context.db, context.access, input),
    ),
    quote: inOrganization.reservations.quote.handler(({ context, input }) =>
      quoteReservation(context.db, context.access, input),
    ),
    create: inOrganization.reservations.create.handler(({ context, input }) =>
      createReservation(context.db, context.access, input),
    ),
    list: inOrganization.reservations.list.handler(({ context, input }) =>
      listReservations(context.db, context.access, input),
    ),
    get: inOrganization.reservations.get.handler(({ context, input }) =>
      getReservation(context.db, context.access, input.id),
    ),
    quoteChange: inOrganization.reservations.quoteChange.handler(({ context, input }) =>
      quoteChange(context.db, context.access, input),
    ),
    modify: inOrganization.reservations.modify.handler(({ context, input }) =>
      modifyReservation(context.db, context.access, input),
    ),
    endQuote: inOrganization.reservations.endQuote.handler(({ context, input }) =>
      endQuote(context.db, context.access, input),
    ),
    cancel: inOrganization.reservations.cancel.handler(({ context, input }) =>
      cancelReservation(context.db, context.access, input),
    ),
    markNoShow: inOrganization.reservations.markNoShow.handler(({ context, input }) =>
      markNoShow(context.db, context.access, input),
    ),
  },
  penalties: {
    waive: inOrganization.penalties.waive.handler(({ context, input }) =>
      waivePenalty(context.db, context.access, input),
    ),
  },
  approvals: {
    approvers: inOrganization.approvals.approvers.handler(async ({ context, input }) =>
      approvals.listApprovers(
        context.db,
        context.access,
        input,
        await approvals.thisDevice(context.db, context.access, context.headers),
      ),
    ),
    // The PIN check has its own lockout; this caps guessing across many approvers from one session.
    approveHere: inOrganization.approvals.approveHere.handler(async ({ context, input }) => {
      context.limiter.take(`approve-here:${context.access.memberId}`, 30, 600)
      return approvals.approveHere(
        context.db,
        context.access,
        input,
        await approvals.thisDevice(context.db, context.access, context.headers),
      )
    }),
    // Each request lands in someone's inbox: 20 per person per 10 minutes is plenty.
    request: inOrganization.approvals.request.handler(async ({ context, input }) => {
      context.limiter.take(`approval-request:${context.access.memberId}`, 20, 600)
      return approvals.requestApproval(
        context.db,
        context.access,
        input,
        await approvals.thisDevice(context.db, context.access, context.headers),
      )
    }),
    get: inOrganization.approvals.get.handler(({ context, input }) =>
      approvals.getApproval(context.db, context.access, input.id),
    ),
    list: inOrganization.approvals.list.handler(({ context, input }) =>
      approvals.listApprovals(context.db, context.access, input),
    ),
    count: inOrganization.approvals.count.handler(({ context, input }) =>
      approvals.countWaiting(context.db, context.access, input),
    ),
    approve: inOrganization.approvals.approve.handler(({ context, input }) => {
      context.limiter.take(`approve:${context.access.memberId}`, 30, 600)
      return approvals.approveRequest(context.db, context.access, input)
    }),
    decline: inOrganization.approvals.decline.handler(({ context, input }) =>
      approvals.declineRequest(context.db, context.access, input),
    ),
    cancel: inOrganization.approvals.cancel.handler(({ context, input }) =>
      approvals.cancelRequest(context.db, context.access, input),
    ),
  },
  guests: {
    search: inOrganization.guests.search.handler(({ context, input }) =>
      searchGuests(context.db, context.access, input),
    ),
  },
  taxes: {
    get: inOrganization.taxes.get.handler(({ context, input }) =>
      taxes.getTaxSetup(context.db, context.access, input.propertyId),
    ),
    setUp: inOrganization.taxes.setUp.handler(({ context, input }) =>
      taxWrites.setUpTaxes(context.db, context.access, input.propertyId),
    ),
    create: inOrganization.taxes.create.handler(({ context, input }) =>
      taxWrites.createTax(context.db, context.access, input),
    ),
    update: inOrganization.taxes.update.handler(({ context, input }) =>
      taxWrites.updateTax(context.db, context.access, input),
    ),
    schedule: inOrganization.taxes.schedule.handler(({ context, input }) =>
      taxWrites.scheduleTaxRate(context.db, context.access, input),
    ),
    cancel: inOrganization.taxes.cancel.handler(({ context, input }) =>
      taxWrites.cancelTaxRate(context.db, context.access, input),
    ),
    verify: inOrganization.taxes.verify.handler(({ context, input }) =>
      taxWrites.verifyTaxRate(context.db, context.access, input),
    ),
    inForce: inOrganization.taxes.inForce.handler(({ context, input }) =>
      taxes.taxRulesInForce(context.db, context.access, input),
    ),
    quote: inOrganization.taxes.quote.handler(({ context, input }) =>
      taxes.quoteTaxLines(context.db, context.access, input),
    ),
  },
  paymentMethods: {
    get: inOrganization.paymentMethods.get.handler(({ context, input }) =>
      paymentMethods.getPaymentSetup(context.db, context.access, input.propertyId),
    ),
    set: inOrganization.paymentMethods.set.handler(({ context, input }) =>
      paymentMethods.setPaymentMethod(context.db, context.access, input),
    ),
  },
  bankAccounts: {
    list: inOrganization.bankAccounts.list.handler(({ context, input }) =>
      bankAccounts.listBankAccounts(context.db, context.access, input),
    ),
    create: inOrganization.bankAccounts.create.handler(({ context, input }) =>
      bankAccounts.createBankAccount(context, context.access, input),
    ),
    update: inOrganization.bankAccounts.update.handler(({ context, input }) =>
      bankAccounts.updateBankAccount(context, context.access, input),
    ),
    archive: inOrganization.bankAccounts.archive.handler(({ context, input }) =>
      bankAccounts.archiveBankAccount(context, context.access, input),
    ),
    restore: inOrganization.bankAccounts.restore.handler(({ context, input }) =>
      bankAccounts.restoreBankAccount(context, context.access, input),
    ),
  },
  posTerminals: {
    list: inOrganization.posTerminals.list.handler(({ context, input }) =>
      terminals.listPosTerminals(context.db, context.access, input),
    ),
    create: inOrganization.posTerminals.create.handler(({ context, input }) =>
      terminals.createPosTerminal(context.db, context.access, input),
    ),
    update: inOrganization.posTerminals.update.handler(({ context, input }) =>
      terminals.updatePosTerminal(context.db, context.access, input),
    ),
    archive: inOrganization.posTerminals.archive.handler(({ context, input }) =>
      terminals.archivePosTerminal(context.db, context.access, input),
    ),
    restore: inOrganization.posTerminals.restore.handler(({ context, input }) =>
      terminals.restorePosTerminal(context.db, context.access, input),
    ),
  },
  fxRates: {
    summary: inOrganization.fxRates.summary.handler(({ context }) =>
      fx.fxSummary(context.db, context.access),
    ),
    list: inOrganization.fxRates.list.handler(({ context, input }) =>
      fx.listFxRates(context.db, context.access, input),
    ),
    enter: inOrganization.fxRates.enter.handler(({ context, input }) =>
      fx.enterFxRates(context.db, context.access, input),
    ),
    forHotel: inOrganization.fxRates.forHotel.handler(({ context, input }) =>
      fx.fxRateForHotel(context.db, context.access, input),
    ),
  },
})
export type Router = typeof router
