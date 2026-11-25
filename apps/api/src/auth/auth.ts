// Sign-in with Better Auth (decision 0017): email + password with verified emails, and the
// organization plugin for hotel groups. Served at /api/auth/*.
import {
  isStrongPassword,
  MEMBER_ROLES,
  MIN_PASSWORD_LENGTH,
  newId,
  PASSWORD_RULE_SUMMARY,
} from '@vento/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { organization } from 'better-auth/plugins/organization'
import { adminAc, memberAc, ownerAc } from 'better-auth/plugins/organization/access'
import { recordSystemAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import {
  accounts,
  invitations,
  members,
  organizations,
  sessions,
  users,
  verifications,
} from '../db/schema/auth.ts'
import type { EmailProvider } from '../providers/email.ts'

export type AuthSettings = {
  secret: string
  baseURL: string
  webOrigin: string
  // Off in tests that don't exercise it, so suites can sign in many times.
  rateLimit?: boolean
}

// Better Auth needs to know every role name. Its own member and invite endpoints are closed
// (OPEN_ORGANIZATION_PATHS below), so this access control only matters for server-side calls; what
// hotel roles may do in Vento comes from the permissions matrix (brick 6) and team rules (brick 8).
const roles = Object.fromEntries(
  MEMBER_ROLES.map((role) => [
    role,
    role === 'owner' ? ownerAc : role === 'group_admin' ? adminAc : memberAc,
  ]),
)

// The Better Auth endpoints that set a password, and which field carries it.
const PASSWORD_PATHS: Record<string, 'password' | 'newPassword' | undefined> = {
  '/sign-up/email': 'password',
  '/reset-password': 'newPassword',
  '/change-password': 'newPassword',
}

// The only Better Auth organization endpoints open over HTTP: what the web app uses to create its
// group, list the groups it belongs to and pick one. Everything else about members and invites
// goes through Vento's API, under the permissions matrix and the audit log (decision 0020).
const OPEN_ORGANIZATION_PATHS = new Set([
  '/organization/create',
  '/organization/list',
  '/organization/set-active',
])

export function createAuth(deps: { db: Database; settings: AuthSettings; email: EmailProvider }) {
  const { db, settings, email } = deps
  return betterAuth({
    secret: settings.secret,
    baseURL: settings.baseURL,
    basePath: '/api/auth',
    trustedOrigins: [settings.webOrigin],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        organization: organizations,
        member: members,
        invitation: invitations,
      },
    }),
    advanced: { database: { generateId: () => newId() } },
    // Slows down password guessing. Counted per network address: a whole hotel often shares one,
    // so the sign-in limit is generous enough for a busy front desk (15 tries per 10 minutes).
    // Per-account lockout comes with device and PIN sign-in (brick 9). Memory storage resets when
    // the API restarts; move to database storage when running more than one API instance.
    rateLimit: {
      enabled: settings.rateLimit ?? true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 600, max: 15 },
        '/sign-up/email': { window: 600, max: 10 },
        '/request-password-reset': { window: 600, max: 5 },
      },
    },
    // The password rule from @vento/shared, enforced wherever a password is set, so it can't be
    // skipped by calling the API directly.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Closed organization endpoints answer 404 over HTTP; server-side calls (ctx.request
        // undefined) still work for tests and scripts.
        const organizationPath = ctx.path.startsWith('/organization/')
        if (ctx.request && organizationPath && !OPEN_ORGANIZATION_PATHS.has(ctx.path)) {
          throw new APIError('NOT_FOUND', { message: 'Not found' })
        }
        const body = (ctx.body ?? {}) as { password?: unknown; newPassword?: unknown }
        const password = PASSWORD_PATHS[ctx.path]
        if (!password) return
        const value = body[password]
        if (typeof value !== 'string' || !isStrongPassword(value)) {
          throw new APIError('BAD_REQUEST', {
            code: 'PASSWORD_TOO_WEAK',
            message: PASSWORD_RULE_SUMMARY,
          })
        }
      }),
    },
    // "Keep me signed in" keeps a session for 30 days (refreshed daily while in use). Unticked, the
    // session cookie ends when the browser closes.
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      // Reset links last 30 minutes (design 24), and a reset signs the account out everywhere else.
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: 'Reset your Vento Hotels password',
          text: `Use this link to choose a new password. It expires soon.\n${url}`,
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: 'Confirm your email for Vento Hotels',
          text: `Confirm your email to finish setting up your account.\n${url}`,
        })
      },
    },
    plugins: [
      organization({
        roles,
        creatorRole: 'owner',
        schema: {
          member: {
            additionalFields: {
              allProperties: {
                type: 'boolean',
                required: false,
                defaultValue: false,
                input: false,
              },
            },
          },
        },
        // Membership changes made through Better Auth's endpoints go into the audit log too.
        // Its hooks don't say who acted, so these events record the subject and the change only.
        organizationHooks: {
          afterAddMember: async ({ member, user, organization: org }) => {
            await recordSystemAudit(db, org.id, {
              action: 'member.added',
              entityType: 'member',
              entityId: member.id,
              after: { userId: user.id, name: user.name, role: member.role },
            })
          },
          afterRemoveMember: async ({ member, user, organization: org }) => {
            await recordSystemAudit(db, org.id, {
              action: 'member.removed',
              entityType: 'member',
              entityId: member.id,
              before: { userId: user.id, name: user.name, role: member.role },
            })
          },
          afterUpdateMemberRole: async ({ member, previousRole, user, organization: org }) => {
            await recordSystemAudit(db, org.id, {
              action: 'member.role_changed',
              entityType: 'member',
              entityId: member.id,
              before: { userId: user.id, name: user.name, role: previousRole },
              after: { userId: user.id, name: user.name, role: member.role },
            })
          },
        },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
