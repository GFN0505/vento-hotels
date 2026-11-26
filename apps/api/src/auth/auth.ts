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
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { organization } from 'better-auth/plugins/organization'
import { adminAc, memberAc, ownerAc } from 'better-auth/plugins/organization/access'
import { z } from 'zod'
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
import { checkPinSignIn, PinSignInError } from '../devices/pin-sign-in.ts'
import { deviceSecretFrom, hashSecret } from '../devices/service.ts'
import { PIN_SESSION_HOURS } from '../devices/session-guard.ts'
import type { EmailProvider } from '../providers/email.ts'
import type { RateLimiter } from '../rate-limit.ts'

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
// Account changes that need a password sign-in, never a PIN session on a shared device.
const ACCOUNT_PATHS = new Set([
  '/update-user',
  '/change-password',
  '/change-email',
  '/set-password',
  '/delete-user',
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/link-social',
  '/unlink-account',
  '/organization/create',
  '/organization/set-active',
])

const OPEN_ORGANIZATION_PATHS = new Set([
  '/organization/create',
  '/organization/list',
  '/organization/set-active',
])

export function createAuth(deps: {
  db: Database
  settings: AuthSettings
  email: EmailProvider
  // Limits PIN attempts per device (decision 0022).
  limiter: RateLimiter
}) {
  const { db, settings, email, limiter } = deps
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
    // Per-account lockout comes with device and PIN sign-in (brick 10). Memory storage resets when
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
        // A PIN session on a shared device can't change the account behind it (decision 0022).
        if (ctx.request && ACCOUNT_PATHS.has(ctx.path)) {
          const current = await getSessionFromCtx(ctx)
          if ((current?.session as { deviceId?: string | null } | undefined)?.deviceId) {
            throw new APIError('FORBIDDEN', {
              message: 'Sign in with your email and password on your own device to do this',
            })
          }
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
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // PIN sessions on shared devices (decision 0022). Set only by Vento's PIN sign-in endpoint.
      additionalFields: {
        deviceId: { type: 'string', required: false, input: false },
        deviceActiveAt: { type: 'date', required: false, input: false },
      },
    },
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
      pinSignIn(db, limiter),
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

const PIN_MESSAGES: Record<PinSignInError['failure']['code'], string> = {
  DEVICE_NOT_REGISTERED: "This device isn't registered",
  DEVICE_REVOKED: 'This device was removed. Ask a manager.',
  CANT_SIGN_IN_HERE: "You can't sign in on this device",
  WRONG_PIN: 'Wrong PIN',
  PIN_LOCKED: 'Too many wrong PINs',
  PIN_NEEDS_RESET: 'Your PIN was locked too many times. Ask a manager to reset it.',
}

// POST /api/auth/device/pin-sign-in: staff sign in on a registered shared device with their PIN
// (decision 0022). A plugin endpoint, so the session and its cookie work like any other sign-in.
function pinSignIn(db: Database, limiter: RateLimiter) {
  return {
    id: 'vento-pin-sign-in',
    endpoints: {
      pinSignIn: createAuthEndpoint(
        '/device/pin-sign-in',
        {
          method: 'POST',
          body: z.object({ memberId: z.string().uuid(), pin: z.string().max(8) }),
        },
        async (ctx) => {
          const secret = ctx.headers ? deviceSecretFrom(ctx.headers) : undefined
          try {
            limiter.take(`pin:${secret ? hashSecret(secret) : 'none'}`, 30, 600)
          } catch {
            throw new APIError('TOO_MANY_REQUESTS', {
              code: 'TOO_MANY_PIN_TRIES',
              message: 'Too many tries on this device. Wait a few minutes.',
            })
          }
          let signedIn: Awaited<ReturnType<typeof checkPinSignIn>>
          try {
            signedIn = await checkPinSignIn(db, { secret, ...ctx.body })
          } catch (error) {
            if (!(error instanceof PinSignInError)) throw error
            throw new APIError(error.failure.code === 'WRONG_PIN' ? 'UNAUTHORIZED' : 'FORBIDDEN', {
              ...error.failure,
              message: PIN_MESSAGES[error.failure.code],
            })
          }
          // overrideAll: otherwise Better Auth replaces our expiry with its own default.
          const session = await ctx.context.internalAdapter.createSession(
            signedIn.userId,
            true,
            {
              activeOrganizationId: signedIn.organizationId,
              deviceId: signedIn.deviceId,
              deviceActiveAt: new Date(),
              expiresAt: new Date(Date.now() + PIN_SESSION_HOURS * 60 * 60 * 1000),
            },
            true,
          )
          const user = await ctx.context.internalAdapter.findUserById(signedIn.userId)
          if (!session || !user) throw new APIError('INTERNAL_SERVER_ERROR')
          await setSessionCookie(ctx, { session, user }, true)
          return ctx.json({ ok: true })
        },
      ),
    },
  }
}
