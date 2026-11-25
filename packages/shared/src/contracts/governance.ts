// Audit log and permissions matrix (spec: docs/specs/stage-0-permissions-and-audit.md).
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { idSchema } from '../ids.ts'
import { pageQuerySchema, pageSchema } from '../pagination.ts'
import { permissionSchema } from '../permissions.ts'
import { memberRoleSchema } from '../roles.ts'

export const auditEventSchema = z.object({
  id: idSchema,
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  propertyId: z.string().nullable(),
  actorMemberId: z.string().nullable(),
  actorName: z.string().nullable(),
  approverMemberId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type AuditEventView = z.infer<typeof auditEventSchema>

export const auditListSchema = pageQuerySchema.extend({
  entityType: z.string().max(60).optional(),
  entityId: idSchema.optional(),
  actorMemberId: idSchema.optional(),
})

export const permissionRuleViewSchema = z.object({
  role: memberRoleSchema,
  permission: permissionSchema,
  label: z.string(),
  allowed: z.boolean(),
  limit: z.string().nullable(),
  limitKind: z.enum(['percent', 'amount_ngn']).nullable(),
  // False when the organization has changed this rule from the default.
  isDefault: z.boolean(),
})
export type PermissionRuleView = z.infer<typeof permissionRuleViewSchema>

const limitValue = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter a limit like 10 or 100000')

export const setPermissionSchema = z.object({
  role: memberRoleSchema,
  permission: permissionSchema,
  allowed: z.boolean(),
  limit: limitValue.nullable().default(null),
  // Changing who may do what is itself a sensitive action.
  reason: z.string().trim().min(3, 'Say why this is changing').max(500),
})

export const governanceContract = {
  audit: {
    list: oc.input(auditListSchema).output(pageSchema(auditEventSchema)),
  },
  permissions: {
    list: oc.output(z.object({ items: z.array(permissionRuleViewSchema) })),
    set: oc.input(setPermissionSchema).output(permissionRuleViewSchema),
  },
}
