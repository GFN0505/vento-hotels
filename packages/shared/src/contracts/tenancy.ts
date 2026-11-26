// Organization, companies (entities), hotels (properties) and property access (specs:
// stage-0-auth-and-tenancy.md, stage-1-hotels-and-companies.md).
// No input here ever carries an organizationId: the API always takes it from the session.
import { oc } from '@orpc/contract'
import { z } from 'zod'
import { rcNumberSchema, tinSchema } from '../company-ids.ts'
import { calendarDateSchema } from '../dates.ts'
import { featureSchema } from '../features.ts'
import { idSchema } from '../ids.ts'
import { isLgaOf } from '../lgas.ts'
import { DEFAULT_TIME_ZONE, isNigerianState } from '../locale.ts'
import { currencySchema } from '../money.ts'
import { pageQuerySchema, pageSchema } from '../pagination.ts'
import { permissionSchema } from '../permissions.ts'
import { memberRoleSchema } from '../roles.ts'

const name = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters')
  .max(120, 'Use 120 characters or fewer')

// Archiving and restoring always need one; some changes to live hotels do too.
export const reasonSchema = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters')
  .max(500)

export const recordStatusSchema = z.enum(['active', 'archived'])
export type RecordStatus = z.infer<typeof recordStatusSchema>

// --- Companies (legal entities, decision 0003) ---------------------------------------------------

export const entitySchema = z.object({
  id: idSchema,
  name: z.string(),
  rcNumber: z.string().nullable(),
  tin: z.string().nullable(),
  vatRegistered: z.boolean(),
  // A VAT registration change on a company with a live hotel waits for the next business date
  // ("VAT registered from 26 Nov 2026"); sending the current value again cancels it.
  pendingVat: z.object({ vatRegistered: z.boolean(), from: calendarDateSchema }).nullable(),
  baseCurrency: currencySchema,
  status: recordStatusSchema,
  // Sent back with every change, so a save never overwrites someone else's.
  version: z.number().int(),
  // Active hotels it owns that the caller can see, by name.
  hotels: z.array(z.object({ id: idSchema, name: z.string() })),
  // Active hotels it owns outside the caller's access ("+ 1 other hotel").
  otherHotels: z.number().int(),
  // Whether the caller may edit, archive or restore it: they manage setup, and every active hotel
  // it owns is within their access.
  canEdit: z.boolean(),
  // At least one hotel it owns is live, so TIN and VAT changes need a reason.
  ownsLiveHotel: z.boolean(),
})
export type Entity = z.infer<typeof entitySchema>

export const createEntitySchema = z.object({
  name,
  rcNumber: rcNumberSchema.optional(),
  tin: tinSchema.optional(),
  vatRegistered: z.boolean().default(false),
})

// Only the fields sent change. null clears an RC number or TIN.
export const updateEntitySchema = z.object({
  id: idSchema,
  version: z.number().int().min(1),
  name: name.optional(),
  rcNumber: rcNumberSchema.nullable().optional(),
  tin: tinSchema.nullable().optional(),
  vatRegistered: z.boolean().optional(),
  reason: reasonSchema.optional(),
})

export const listEntitiesSchema = pageQuerySchema.extend({
  status: recordStatusSchema.default('active'),
  // Only the company that owns this hotel (one hotel chosen in the top bar).
  propertyId: idSchema.optional(),
})

export const recordReasonSchema = z.object({ id: idSchema, reason: reasonSchema })

// --- Hotels (properties) -------------------------------------------------------------------------

// Setting up until the first night audit completes (go-live), then live.
export const propertyStatusSchema = z.enum(['setting_up', 'live', 'archived'])
export type PropertyStatus = z.infer<typeof propertyStatusSchema>

export const propertySchema = z.object({
  id: idSchema,
  entityId: idSchema,
  entityName: z.string(),
  // The owning company has no RC number or no TIN yet: "RC number and TIN missing".
  entityDetailsMissing: z.boolean(),
  // A change of owning company on a live hotel waits for the next business date.
  pendingEntity: z.object({ id: idSchema, name: z.string(), from: calendarDateSchema }).nullable(),
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
  status: propertyStatusSchema,
  archivedAt: z.iso.datetime().nullable(),
  // A short-lived signed link; `uploadId` brings a removed logo back (Undo).
  logo: z.object({ uploadId: idSchema, url: z.string() }).nullable(),
  // Active rooms.
  roomCount: z.number().int(),
  version: z.number().int(),
})
export type Property = z.infer<typeof propertySchema>

// 24-hour times in 5-minute steps.
const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5][05]$/, 'Use 24-hour time in 5-minute steps, like 14:00')

const timeZone = z
  .string()
  .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'Unknown time zone')

const street = z.string().trim().min(1, 'Enter the street').max(200, 'Use 200 characters or fewer')
const area = z.string().trim().min(1, 'Enter the area').max(120, 'Use 120 characters or fewer')
// Typed as a string so forms can hold an unchosen value; only the 36 states and FCT pass.
const state = z.string().refine(isNigerianState, 'Choose a state')
const lga = z.string().trim().min(1, 'Choose an LGA').max(80)

const lgaMatchesState = (value: { state?: string | undefined; lga?: string | undefined }) =>
  !value.lga || (value.state !== undefined && isLgaOf(value.state, value.lga))
const lgaIssue = { path: ['lga'], message: 'Choose an LGA in this state' }

const propertyFields = {
  entityId: idSchema,
  name,
  timeZone: timeZone.default(DEFAULT_TIME_ZONE),
  checkInTime: clockTime.optional(),
  checkOutTime: clockTime.optional(),
}

// What the API accepts. The address may be left out only for the group's first hotel, which
// onboarding creates with just a name and state; the API refuses it for any later hotel.
export const createPropertySchema = z
  .object({
    ...propertyFields,
    addressLine1: street.optional(),
    area: area.optional(),
    state: state.optional(),
    lga: lga.optional(),
  })
  .refine(lgaMatchesState, lgaIssue)

// The "Add a hotel" form: the full address is required.
export const addPropertyFormSchema = z
  .object({ ...propertyFields, addressLine1: street, area, state, lga })
  .refine(lgaMatchesState, lgaIssue)

// Only the fields sent change. A hotel's address can be completed later, but never cleared.
export const updatePropertySchema = z.object({
  id: idSchema,
  version: z.number().int().min(1),
  name: name.optional(),
  entityId: idSchema.optional(),
  addressLine1: street.optional(),
  area: area.optional(),
  state: state.optional(),
  lga: lga.optional(),
  timeZone: timeZone.optional(),
  checkInTime: clockTime.optional(),
  checkOutTime: clockTime.optional(),
  // Needed after go-live to change the owning company.
  reason: reasonSchema.optional(),
})

export const listPropertiesSchema = pageQuerySchema.extend({
  // Archived hotels are listed only for people who manage setup.
  status: recordStatusSchema.default('active'),
  q: z.string().trim().max(120).optional(),
})

export const restorePropertySchema = recordReasonSchema.extend({
  // Required when the hotel's company was archived meanwhile.
  entityId: idSchema.optional(),
})

// What archiving would do, for the dialog. `blockers` lists what must be closed first.
export const archivePreviewSchema = z.object({
  rooms: z.number().int(),
  devices: z.number().int(),
  // People limited to hotels whose only active hotel is this one.
  peopleOnlyHere: z.number().int(),
  invitationsOnlyHere: z.number().int(),
  // The group's last active hotel can't be archived.
  lastHotel: z.boolean(),
  blockers: z.array(z.object({ code: z.string(), count: z.number().int(), label: z.string() })),
})
export type ArchivePreview = z.infer<typeof archivePreviewSchema>

// --- Hotel logo ------------------------------------------------------------------------------------

export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
// The shorter side, in pixels.
export const LOGO_MIN_PIXELS = 200
const logoProblem = 'Use a PNG or JPEG up to 2 MB.'

export const logoUploadRequestSchema = z.object({
  propertyId: idSchema,
  contentType: z.enum(LOGO_CONTENT_TYPES, logoProblem),
  size: z.number().int().min(1, logoProblem).max(LOGO_MAX_BYTES, logoProblem),
})

// Send the file with `method` to `url` with exactly these headers, before `expiresAt`, then call
// properties.setLogo with the uploadId.
export const logoUploadSchema = z.object({
  uploadId: idSchema,
  url: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
})
export type LogoUpload = z.infer<typeof logoUploadSchema>

export const setLogoSchema = z.object({ propertyId: idSchema, uploadId: idSchema })

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
    list: oc.input(listEntitiesSchema).output(pageSchema(entitySchema)),
    get: oc.input(z.object({ id: idSchema })).output(entitySchema),
    create: oc.input(createEntitySchema).output(entitySchema),
    update: oc.input(updateEntitySchema).output(entitySchema),
    archive: oc.input(recordReasonSchema).output(entitySchema),
    restore: oc.input(recordReasonSchema).output(entitySchema),
  },
  properties: {
    list: oc.input(listPropertiesSchema).output(pageSchema(propertySchema)),
    get: oc.input(z.object({ id: idSchema })).output(propertySchema),
    create: oc.input(createPropertySchema).output(propertySchema),
    update: oc.input(updatePropertySchema).output(propertySchema),
    // A scheduled change exists only on a live hotel, so cancelling it needs a reason too.
    cancelEntityChange: oc
      .input(z.object({ id: idSchema, version: z.number().int().min(1), reason: reasonSchema }))
      .output(propertySchema),
    archivePreview: oc.input(z.object({ id: idSchema })).output(archivePreviewSchema),
    archive: oc.input(recordReasonSchema).output(propertySchema),
    restore: oc.input(restorePropertySchema).output(propertySchema),
    logoUploadUrl: oc.input(logoUploadRequestSchema).output(logoUploadSchema),
    setLogo: oc.input(setLogoSchema).output(propertySchema),
    removeLogo: oc.input(z.object({ propertyId: idSchema })).output(propertySchema),
  },
  members: {
    setPropertyAccess: oc.input(setPropertyAccessSchema).output(z.object({ ok: z.literal(true) })),
  },
}
