// Organization, entities, properties and property access (spec: docs/specs/stage-0-auth-and-tenancy.md).
// No input here ever carries an organizationId: the API always takes it from the session.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { calendarDateSchema } from '../dates.ts'
import { featureSchema } from '../features.ts'
import { idSchema } from '../ids.ts'
import { currencySchema } from '../money.ts'
import { pageQuerySchema, pageSchema } from '../pagination.ts'
import { permissionSchema } from '../permissions.ts'
import { memberRoleSchema } from '../roles.ts'

const name = z.string().trim().min(2, 'Enter at least 2 characters').max(120)
const optionalText = z.string().trim().max(200).optional()

export const entitySchema = z.object({
  id: idSchema,
  name: z.string(),
  rcNumber: z.string().nullable(),
  tin: z.string().nullable(),
  vatRegistered: z.boolean(),
  baseCurrency: currencySchema,
})
export type Entity = z.infer<typeof entitySchema>

export const createEntitySchema = z.object({
  name,
  rcNumber: optionalText,
  tin: optionalText,
  vatRegistered: z.boolean().default(false),
})

export const propertySchema = z.object({
  id: idSchema,
  entityId: idSchema,
  name: z.string(),
  addressLine1: z.string().nullable(),
  area: z.string().nullable(),
  lga: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string(),
  timeZone: z.string(),
  checkInTime: z.string(),
  checkOutTime: z.string(),
  businessDate: calendarDateSchema,
  // Go-live: the business date closed by the property's first night audit; null until then.
  // Before go-live, room setup changes need no reason and raise no exceptions.
  liveSince: calendarDateSchema.nullable(),
})
export type Property = z.infer<typeof propertySchema>

const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, like 14:00')
  .optional()

export const createPropertySchema = z.object({
  entityId: idSchema,
  name,
  addressLine1: optionalText,
  area: optionalText,
  lga: optionalText,
  state: optionalText,
  timeZone: z
    .string()
    .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'Unknown time zone')
    .default('Africa/Lagos'),
  checkInTime: clockTime,
  checkOutTime: clockTime,
})

export const currentOrganizationSchema = z.object({
  organization: z.object({ id: idSchema, name: z.string(), slug: z.string() }),
  member: z.object({ id: idSchema, role: memberRoleSchema, allProperties: z.boolean() }),
  // What this member may do, so the web app shows only what they can use. The API still checks.
  permissions: z.array(permissionSchema),
  // Modules switched on for this group (decision 0021).
  features: z.array(featureSchema),
  // Set when signed in with a PIN on a shared device: lock after this long without a touch.
  device: z.object({ id: idSchema, name: z.string(), idleSeconds: z.number().int() }).nullable(),
  // Whether this member has set a staff PIN.
  hasPin: z.boolean(),
  // Whether this person has two-step sign-in on (decision 0023).
  twoStep: z.boolean(),
})

export const setPropertyAccessSchema = z.discriminatedUnion('allProperties', [
  z.object({ memberId: idSchema, allProperties: z.literal(true) }),
  z.object({
    memberId: idSchema,
    allProperties: z.literal(false),
    propertyIds: z.array(idSchema).max(500),
  }),
])

// Figures for Home. Team and device counts are only for people who manage them (null otherwise).
export const homeSummarySchema = z.object({
  hotels: z.number().int(),
  members: z.number().int().nullable(),
  pendingInvites: z.number().int().nullable(),
  devices: z.number().int().nullable(),
  // Active rooms across the hotels the member can see (the "Set up rooms" checklist step).
  rooms: z.number().int(),
  // Per hotel the member can see: who can work there (including group-wide people) and its shared
  // devices. Counts only, so every role can see how its own hotel is staffed.
  byHotel: z.array(
    z.object({
      propertyId: idSchema,
      people: z.number().int(),
      devices: z.number().int(),
      rooms: z.number().int(),
    }),
  ),
})
export type HomeSummary = z.infer<typeof homeSummarySchema>

export const tenancyContract = {
  organization: {
    current: oc.output(currentOrganizationSchema),
    home: oc.output(homeSummarySchema),
  },
  entities: {
    list: oc.input(pageQuerySchema).output(pageSchema(entitySchema)),
    create: oc.input(createEntitySchema).output(entitySchema),
  },
  properties: {
    list: oc.input(pageQuerySchema).output(pageSchema(propertySchema)),
    get: oc.input(z.object({ id: idSchema })).output(propertySchema),
    create: oc.input(createPropertySchema).output(propertySchema),
  },
  members: {
    setPropertyAccess: oc.input(setPropertyAccessSchema).output(z.object({ ok: z.literal(true) })),
  },
}
