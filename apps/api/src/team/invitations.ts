// Invitations (decision 0020): invite by email with a role and hotels, resend, cancel, and join
// from the link. The link carries a random secret; only its hash is stored.
import { createHash, randomBytes } from 'node:crypto'
import { ORPCError } from '@orpc/server'
import {
  type AccessChoice,
  type InvitationPreview,
  type InvitationView,
  isGroupAdmin,
  type MemberRole,
  newId,
  type PageQuery,
  pageOffset,
  roleLabel,
  toPage,
} from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { type Actor, recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { isUniqueViolation } from '../db/errors.ts'
import { accounts, invitations, members, organizations, users } from '../db/schema/auth.ts'
import { invitationProperties, memberProperties, properties } from '../db/schema/tenancy.ts'
import type { EmailProvider } from '../providers/email.ts'
import {
  type Access,
  loadAccess,
  requireListableHotel,
  requirePermission,
} from '../tenancy/access.ts'
import {
  grantableAccess,
  invitedTo,
  type NormalizedAccess,
  openInvite,
  requireCanManage,
} from './rules.ts'

type Reader = Pick<Database, 'select'>
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export type InviteDeps = { db: Database; email: EmailProvider; webOrigin: string }

const INVITE_DAYS = 7
const notFound = () => new ORPCError('NOT_FOUND', { message: "We couldn't find that invite" })

function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function expiryFromNow(): Date {
  return new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000)
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  }).format(date)
}

async function sendInvite(
  deps: InviteDeps,
  message: {
    to: string
    token: string
    inviter: string
    group: string
    role: string
    expires: Date
  },
) {
  await deps.email.send({
    to: message.to,
    subject: `${message.inviter} invited you to ${message.group} on Vento Hotels`,
    text: [
      `${message.inviter} invited you to join ${message.group} as ${roleLabel(message.role)}.`,
      `Open this link to set your password and get started. It works until ${formatDay(message.expires)}.`,
      `${deps.webOrigin}/join/${message.token}`,
      '',
      "If you weren't expecting this, you can ignore this email.",
    ].join('\n'),
  })
}

async function groupName(db: Reader, organizationId: string): Promise<string> {
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
  return org?.name ?? 'your hotel group'
}

async function setInviteHotels(tx: Tx, organizationId: string, id: string, ids: string[]) {
  await tx.delete(invitationProperties).where(eq(invitationProperties.invitationId, id))
  if (ids.length === 0) return
  await tx
    .insert(invitationProperties)
    .values(ids.map((propertyId) => ({ organizationId, invitationId: id, propertyId })))
}

export async function createInvitations(
  deps: InviteDeps,
  access: Access,
  input: { emails: string[]; role: MemberRole; access: AccessChoice },
): Promise<{ invited: number; alreadyMembers: string[]; notSent: string[] }> {
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()))]
  const toSend: { to: string; token: string; expires: Date }[] = []
  const alreadyMembers: string[] = []

  await deps.db.transaction(async (tx) => {
    await requireCanManage(tx, access, input.role)
    const grant = await grantableAccess(tx, access, input.role, input.access)
    const existing = await tx
      .select({ email: users.email })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, access.organizationId),
          inArray(sql`lower(${users.email})`, emails),
        ),
      )
    const memberEmails = new Set(existing.map((row) => row.email.toLowerCase()))

    for (const email of emails) {
      if (memberEmails.has(email)) {
        alreadyMembers.push(email)
        continue
      }
      const { token, tokenHash } = newToken()
      const expires = expiryFromNow()
      const values = {
        role: input.role,
        allProperties: grant.allProperties,
        tokenHash,
        expiresAt: expires,
        inviterId: access.userId,
      }
      // An email with a pending invite gets that invite refreshed, not a second one.
      const [pending] = await tx
        .select({ id: invitations.id, role: invitations.role })
        .from(invitations)
        .where(
          and(
            eq(invitations.organizationId, access.organizationId),
            eq(invitations.email, email),
            eq(invitations.status, 'pending'),
          ),
        )
        .for('update')
      let id: string
      if (pending) {
        // Replacing someone else's invite needs the same rights as resending or cancelling it.
        if (!access.allProperties) {
          throw new ORPCError('CONFLICT', {
            message: `${email} already has an invite. Ask an owner or group admin to change it.`,
          })
        }
        await requireCanManage(tx, access, pending.role ?? 'viewer')
        id = pending.id
        await tx.update(invitations).set(values).where(eq(invitations.id, id))
      } else {
        id = newId()
        await tx.insert(invitations).values({
          id,
          organizationId: access.organizationId,
          email,
          status: 'pending',
          ...values,
        })
      }
      await setInviteHotels(tx, access.organizationId, id, grant.propertyIds)
      await recordAudit(tx, access, {
        action: 'member.invited',
        entityType: 'invitation',
        entityId: id,
        after: { email, role: input.role, ...grant },
      })
      toSend.push({ to: email, token, expires })
    }
  })

  // Sent after the invites are saved, each on its own: one failure doesn't stop the rest, and the
  // people it missed are listed so Resend can send them a fresh link.
  const group = await groupName(deps.db, access.organizationId)
  const notSent: string[] = []
  for (const message of toSend) {
    try {
      await sendInvite(deps, { ...message, inviter: access.userName, group, role: input.role })
    } catch (error) {
      // No addresses in logs (guest and staff data stay out of them).
      console.error('Invite email failed:', error instanceof Error ? error.message : error)
      notSent.push(message.to)
    }
  }
  return { invited: toSend.length - notSent.length, alreadyMembers, notSent }
}

export async function listInvitations(
  db: Database,
  access: Access,
  query: PageQuery & { propertyId?: string | undefined },
) {
  // Invites are a group-level list, for people who manage the whole group's people. A hotel is
  // checked first, so a hotel outside the caller's access is "not found" for everyone.
  requirePermission(access, 'setup.manage')
  if (query.propertyId) await requireListableHotel(db, access, query.propertyId)
  if (!access.allProperties) return toPage<InvitationView>([], 0, query)
  const where = and(
    eq(invitations.organizationId, access.organizationId),
    openInvite(),
    query.propertyId ? invitedTo(query.propertyId) : undefined,
  )
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        allProperties: invitations.allProperties,
        invitedBy: users.name,
        sentAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.inviterId))
      .where(where)
      .orderBy(desc(invitations.createdAt), desc(invitations.id))
      .limit(query.pageSize)
      .offset(pageOffset(query)),
    db.select({ value: count() }).from(invitations).where(where),
  ])
  const hotels = await inviteHotels(
    db,
    rows.map((row) => row.id),
  )
  const now = Date.now()
  const items: InvitationView[] = rows.map((row) => {
    const wholeGroup = row.allProperties || isGroupAdmin(row.role ?? '')
    return {
      id: row.id,
      email: row.email,
      role: (row.role ?? 'viewer') as MemberRole,
      allProperties: wholeGroup,
      properties: wholeGroup ? [] : (hotels.get(row.id) ?? []),
      invitedBy: row.invitedBy,
      sentAt: row.sentAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status: row.expiresAt.getTime() < now ? 'expired' : 'pending',
    }
  })
  return toPage(items, total?.value ?? 0, query)
}

async function inviteHotels(db: Reader, ids: string[]) {
  const byInvite = new Map<string, { id: string; name: string }[]>()
  if (ids.length === 0) return byInvite
  const rows = await db
    .select({
      invitationId: invitationProperties.invitationId,
      id: properties.id,
      name: properties.name,
    })
    .from(invitationProperties)
    .innerJoin(properties, eq(properties.id, invitationProperties.propertyId))
    .where(and(inArray(invitationProperties.invitationId, ids), isNull(properties.archivedAt)))
    .orderBy(asc(properties.name))
  for (const row of rows) {
    const list = byInvite.get(row.invitationId) ?? []
    list.push({ id: row.id, name: row.name })
    byInvite.set(row.invitationId, list)
  }
  return byInvite
}

async function findPendingInvite(tx: Tx, access: Access, id: string) {
  const [invite] = await tx
    .select({ id: invitations.id, email: invitations.email, role: invitations.role })
    .from(invitations)
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.organizationId, access.organizationId),
        eq(invitations.status, 'pending'),
      ),
    )
    .for('update')
  if (!invite || !access.allProperties) throw notFound()
  await requireCanManage(tx, access, invite.role ?? 'viewer')
  return invite
}

export async function resendInvitation(
  deps: InviteDeps,
  access: Access,
  id: string,
): Promise<{ ok: true }> {
  const { token, tokenHash } = newToken()
  const expires = expiryFromNow()
  const invite = await deps.db.transaction(async (tx) => {
    const found = await findPendingInvite(tx, access, id)
    await tx
      .update(invitations)
      .set({ tokenHash, expiresAt: expires, inviterId: access.userId })
      .where(eq(invitations.id, found.id))
    await recordAudit(tx, access, {
      action: 'invitation.resent',
      entityType: 'invitation',
      entityId: found.id,
      after: { email: found.email, expiresAt: expires.toISOString() },
    })
    return found
  })
  try {
    await sendInvite(deps, {
      to: invite.email,
      token,
      expires,
      inviter: access.userName,
      group: await groupName(deps.db, access.organizationId),
      role: invite.role ?? 'viewer',
    })
  } catch (error) {
    console.error('Invite email failed:', error instanceof Error ? error.message : error)
    throw new ORPCError('SERVICE_UNAVAILABLE', {
      message: "We couldn't send the email just now. Try Resend again in a minute.",
    })
  }
  return { ok: true }
}

export async function cancelInvitation(
  db: Database,
  access: Access,
  id: string,
): Promise<{ ok: true }> {
  await db.transaction(async (tx) => {
    const invite = await findPendingInvite(tx, access, id)
    await tx.update(invitations).set({ status: 'canceled' }).where(eq(invitations.id, invite.id))
    await recordAudit(tx, access, {
      action: 'invitation.cancelled',
      entityType: 'invitation',
      entityId: invite.id,
      before: { email: invite.email, role: invite.role },
    })
  })
  return { ok: true }
}

// --- Joining from the link ----------------------------------------------------------------------

type LiveInvite = {
  id: string
  organizationId: string
  email: string
  role: MemberRole
  allProperties: boolean
  inviterName: string
}

async function inviteByToken(db: Reader, token: string) {
  const [row] = await db
    .select({
      id: invitations.id,
      organizationId: invitations.organizationId,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      allProperties: invitations.allProperties,
      inviterId: invitations.inviterId,
      inviterName: users.name,
      organizationName: organizations.name,
    })
    .from(invitations)
    .innerJoin(users, eq(users.id, invitations.inviterId))
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(eq(invitations.tokenHash, hashToken(token)))
  return row
}

function isLive(row: { status: string; expiresAt: Date }): boolean {
  return row.status === 'pending' && row.expiresAt.getTime() > Date.now()
}

export async function previewInvitation(db: Database, token: string): Promise<InvitationPreview> {
  const row = await inviteByToken(db, token)
  if (!row || !isLive(row) || !(await inviterStillMay(db, row))) {
    return { status: 'unavailable', invitedBy: row?.inviterName ?? null }
  }
  const role = (row.role ?? 'viewer') as MemberRole
  const wholeGroup = row.allProperties || isGroupAdmin(role)
  const hotels = wholeGroup ? new Map() : await inviteHotels(db, [row.id])
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, row.email.toLowerCase()))
  return {
    status: 'pending',
    email: row.email,
    organizationName: row.organizationName,
    invitedBy: row.inviterName,
    role,
    allProperties: wholeGroup,
    propertyNames: (hotels.get(row.id) ?? []).map((h: { name: string }) => h.name),
    expiresAt: row.expiresAt.toISOString(),
    hasAccount: Boolean(account),
  }
}

// An invite is only as good as its sender's rights today: if they've left the group, lost the
// right to manage people, or can no longer hand out this role or these hotels, it stops working.
async function inviterStillMay(
  db: Reader,
  row: {
    id: string
    organizationId: string
    inviterId: string
    role: string | null
    allProperties: boolean
  },
): Promise<boolean> {
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, row.inviterId))
  const inviter = user
    ? await loadAccess(db, row.organizationId, { id: row.inviterId, name: user.name })
    : undefined
  if (!inviter) return false
  const role = row.role ?? 'viewer'
  try {
    await requireCanManage(db, inviter, role)
  } catch {
    return false
  }
  if (row.allProperties || isGroupAdmin(role)) return inviter.allProperties
  if (inviter.allProperties) return true
  const hotels = await db
    .select({ id: invitationProperties.propertyId })
    .from(invitationProperties)
    .where(eq(invitationProperties.invitationId, row.id))
  return hotels.every((hotel) => inviter.propertyIds.includes(hotel.id))
}

const unusable = (inviter: string | null) =>
  new ORPCError('CONFLICT', {
    message: inviter
      ? `This invite can't be used any more. Ask ${inviter} for a new one.`
      : "This invite can't be used any more. Ask whoever invited you for a new one.",
    data: { code: 'INVITE_UNAVAILABLE' },
  })

// Locks the invite row so two people opening the same link can't both join.
async function lockLiveInvite(tx: Tx, token: string): Promise<LiveInvite> {
  const [row] = await tx
    .select({
      id: invitations.id,
      organizationId: invitations.organizationId,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      allProperties: invitations.allProperties,
      inviterId: invitations.inviterId,
    })
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)))
    .for('update')
  const [inviter] = row
    ? await tx.select({ name: users.name }).from(users).where(eq(users.id, row.inviterId))
    : []
  if (!row || !isLive(row) || !(await inviterStillMay(tx, row))) {
    throw unusable(inviter?.name ?? null)
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: (row.role ?? 'viewer') as MemberRole,
    allProperties: row.allProperties,
    inviterName: inviter?.name ?? 'the person who invited you',
  }
}

// Adds the person to the group with the invite's role and hotels, marks the invite used, and
// records it with the new member as the actor.
async function addFromInvite(tx: Tx, invite: LiveInvite, user: { id: string; name: string }) {
  const wholeGroup = invite.allProperties || isGroupAdmin(invite.role)
  const memberId = newId()
  await tx.insert(members).values({
    id: memberId,
    organizationId: invite.organizationId,
    userId: user.id,
    role: invite.role,
    allProperties: wholeGroup,
  })
  const hotelIds = wholeGroup
    ? []
    : (
        await tx
          .select({ id: invitationProperties.propertyId })
          .from(invitationProperties)
          .innerJoin(properties, eq(properties.id, invitationProperties.propertyId))
          .where(
            and(eq(invitationProperties.invitationId, invite.id), isNull(properties.archivedAt)),
          )
      ).map((row) => row.id)
  if (hotelIds.length > 0) {
    await tx.insert(memberProperties).values(
      hotelIds.map((propertyId) => ({
        organizationId: invite.organizationId,
        memberId,
        propertyId,
      })),
    )
  }
  await tx.update(invitations).set({ status: 'accepted' }).where(eq(invitations.id, invite.id))
  const actor: Actor = {
    organizationId: invite.organizationId,
    userId: user.id,
    memberId,
    userName: user.name,
  }
  const access: NormalizedAccess = { allProperties: wholeGroup, propertyIds: hotelIds.sort() }
  await recordAudit(tx, actor, {
    action: 'member.joined',
    entityType: 'member',
    entityId: memberId,
    after: {
      name: user.name,
      email: invite.email,
      role: invite.role,
      invitationId: invite.id,
      ...access,
    },
  })
}

// A new person joins: their account (email verified, since the link was sent to it), password,
// membership and hotels are created together. The web app then signs in with the new password.
export async function joinWithInvitation(
  db: Database,
  input: { token: string; name: string; password: string },
): Promise<{ email: string }> {
  // Check the link before the (deliberately slow) password hashing, so junk requests stay cheap.
  const found = await inviteByToken(db, input.token)
  if (!found || !isLive(found)) throw unusable(found?.inviterName ?? null)
  const passwordHash = await hashPassword(input.password)
  try {
    return await db.transaction(async (tx) => {
      const invite = await lockLiveInvite(tx, input.token)
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(sql`lower(${users.email})`, invite.email.toLowerCase()))
      if (existing) throw hasAccount()
      const userId = newId()
      await tx.insert(users).values({
        id: userId,
        name: input.name,
        email: invite.email,
        emailVerified: true,
      })
      await tx.insert(accounts).values({
        id: newId(),
        userId,
        providerId: 'credential',
        accountId: userId,
        password: passwordHash,
      })
      await addFromInvite(tx, invite, { id: userId, name: input.name })
      return { email: invite.email }
    })
  } catch (error) {
    // Two invites to the same new email, joined at the same moment: the second finds the account.
    if (isUniqueViolation(error)) throw hasAccount()
    throw error
  }
}

const hasAccount = () =>
  new ORPCError('CONFLICT', {
    message: 'You already have a Vento account. Sign in to accept this invite.',
    data: { code: 'HAS_ACCOUNT' },
  })

// Someone with an account, signed in as the invited email, accepts.
export async function acceptInvitation(
  db: Database,
  user: { id: string; name: string; email: string },
  token: string,
): Promise<{ organizationId: string }> {
  return db.transaction(async (tx) => {
    const invite = await lockLiveInvite(tx, token)
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ORPCError('FORBIDDEN', {
        message: `This invite is for ${invite.email}. Sign out, then open the link again.`,
        data: { code: 'WRONG_ACCOUNT' },
      })
    }
    const [already] = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.organizationId, invite.organizationId), eq(members.userId, user.id)))
    if (already) {
      await tx.update(invitations).set({ status: 'accepted' }).where(eq(invitations.id, invite.id))
      await recordAudit(
        tx,
        {
          organizationId: invite.organizationId,
          userId: user.id,
          memberId: already.id,
          userName: user.name,
        },
        {
          action: 'invitation.accepted',
          entityType: 'invitation',
          entityId: invite.id,
          after: { email: invite.email, alreadyMember: true },
        },
      )
    } else {
      await addFromInvite(tx, invite, user)
    }
    return { organizationId: invite.organizationId }
  })
}
