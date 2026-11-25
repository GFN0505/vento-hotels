// Sign-in with Better Auth (decision 0017): email + password with verified emails, and the
// organization plugin for hotel groups. Served at /api/auth/*.
import { MEMBER_ROLES, newId } from '@vento/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins/organization'
import { adminAc, memberAc, ownerAc } from 'better-auth/plugins/organization/access'
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
}

// Better Auth's own organization management (invite, remove, change role) uses its built-in
// access control: owners and group admins manage the group, every other hotel role is a plain
// member there. What hotel roles may do in Vento itself comes from the permissions matrix (brick 6).
const roles = Object.fromEntries(
  MEMBER_ROLES.map((role) => [
    role,
    role === 'owner' ? ownerAc : role === 'group_admin' ? adminAc : memberAc,
  ]),
)

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
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      sendResetPassword: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: 'Reset your Vento password',
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
          subject: 'Confirm your email for Vento',
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
        sendInvitationEmail: async ({ email: to, organization: org, inviter, id }) => {
          await email.send({
            to,
            subject: `Join ${org.name} on Vento`,
            text: `${inviter.user.name} invited you to ${org.name}. Invitation: ${settings.webOrigin}/accept-invitation/${id}`,
          })
        },
      }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
