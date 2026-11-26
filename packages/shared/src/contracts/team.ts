// Members, invitations and joining (spec: docs/specs/stage-0-team-and-roles.md, decision 0020).
// As everywhere, no input carries an organizationId: the API takes it from the session.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { idSchema } from '../ids.ts'
import { pageQuerySchema, pageSchema } from '../pagination.ts'
import { isStrongPassword, PASSWORD_RULE_SUMMARY } from '../password.ts'
import { memberRoleSchema, ROLE_FILTERS } from '../roles.ts'

// Which hotels someone sees: the whole group, or a list of at least one.
export const accessSchema = z.discriminatedUnion('allProperties', [
  z.object({ allProperties: z.literal(true) }),
  z.object({
    allProperties: z.literal(false),
    propertyIds: z.array(idSchema).min(1, 'Choose at least one hotel').max(500),
  }),
])
export type AccessChoice = z.infer<typeof accessSchema>

const propertyRef = z.object({ id: idSchema, name: z.string() })

export const memberViewSchema = z.object({
  id: idSchema,
  userId: idSchema,
  name: z.string(),
  email: z.string(),
  role: memberRoleSchema,
  allProperties: z.boolean(),
  properties: z.array(propertyRef),
  joinedAt: z.iso.datetime(),
  isYou: z.boolean(),
  hasPin: z.boolean(),
  // Two-step sign-in turned on (decision 0023).
  twoStep: z.boolean(),
})
export type MemberView = z.infer<typeof memberViewSchema>

export const memberListSchema = pageQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  filter: z.enum(Object.keys(ROLE_FILTERS) as [keyof typeof ROLE_FILTERS]).optional(),
})

export const updateMemberSchema = z.object({
  memberId: idSchema,
  role: memberRoleSchema,
  access: accessSchema,
})

export const invitationViewSchema = z.object({
  id: idSchema,
  email: z.string(),
  role: memberRoleSchema,
  allProperties: z.boolean(),
  properties: z.array(propertyRef),
  invitedBy: z.string(),
  sentAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  status: z.enum(['pending', 'expired']),
})
export type InvitationView = z.infer<typeof invitationViewSchema>

const email = z.email('Enter a valid email').trim().toLowerCase().max(254)

export const createInvitationsSchema = z.object({
  emails: z
    .array(email)
    .min(1, 'Enter at least one email')
    .max(20, 'Invite up to 20 people at a time'),
  role: memberRoleSchema,
  access: accessSchema,
})

// The secret from the invite link: 32 random bytes, base64url.
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'This link is not valid')

export const invitationPreviewSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'),
    email: z.string(),
    organizationName: z.string(),
    invitedBy: z.string(),
    role: memberRoleSchema,
    allProperties: z.boolean(),
    propertyNames: z.array(z.string()),
    expiresAt: z.iso.datetime(),
    // True when this email already has a Vento account: the page asks them to sign in.
    hasAccount: z.boolean(),
  }),
  // Unknown, used, cancelled and expired links all look the same from outside.
  z.object({ status: z.literal('unavailable'), invitedBy: z.string().nullable() }),
])
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>

export const joinSchema = z.object({
  token: inviteTokenSchema,
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  password: z
    .string()
    .max(128, 'Use at most 128 characters')
    .refine(isStrongPassword, PASSWORD_RULE_SUMMARY),
})

const ok = z.object({ ok: z.literal(true) })

export const teamContract = {
  members: {
    list: oc.input(memberListSchema).output(pageSchema(memberViewSchema)),
    update: oc.input(updateMemberSchema).output(memberViewSchema),
    remove: oc.input(z.object({ memberId: idSchema })).output(ok),
  },
  invitations: {
    list: oc.input(pageQuerySchema).output(pageSchema(invitationViewSchema)),
    create: oc.input(createInvitationsSchema).output(
      z.object({
        invited: z.number().int(),
        alreadyMembers: z.array(z.string()),
        // Saved, but the email couldn't be sent: Resend from the list.
        notSent: z.array(z.string()),
      }),
    ),
    resend: oc.input(z.object({ id: idSchema })).output(ok),
    cancel: oc.input(z.object({ id: idSchema })).output(ok),
    // Public: the invite link is the credential.
    preview: oc.input(z.object({ token: inviteTokenSchema })).output(invitationPreviewSchema),
    join: oc.input(joinSchema).output(z.object({ email: z.string() })),
    // Signed in as the invited email.
    accept: oc
      .input(z.object({ token: inviteTokenSchema }))
      .output(z.object({ organizationId: idSchema })),
  },
}
