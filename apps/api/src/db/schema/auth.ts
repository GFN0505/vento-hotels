// Tables Better Auth reads and writes (users, sessions, organizations, members…), with the fields
// it requires for email + password sign-in and the organization plugin. Better Auth generates the
// ids with newId() (UUID v7), so they follow the same rule as every other table.
// Keep in step with `getAuthTables()` from better-auth/db when upgrading Better Auth.
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' })
const created = () => timestamptz().notNull().defaultNow()
const updated = () =>
  timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

export const users = pgTable('users', {
  id: uuid().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  // Two-step sign-in (decision 0023), managed by Better Auth's two-factor plugin.
  twoFactorEnabled: boolean().notNull().default(false),
  createdAt: created(),
  updatedAt: updated(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey(),
    token: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz().notNull(),
    ipAddress: text(),
    userAgent: text(),
    activeOrganizationId: uuid(),
    // Set for PIN sessions on a shared device (decision 0022); null for password sign-ins.
    deviceId: uuid(),
    // Last request in a PIN session: the server signs it out after the device's idle time, even
    // if the browser never got the chance (power or internet cut, reload).
    deviceActiveAt: timestamptz(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index().on(t.userId), index().on(t.deviceId)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamptz(),
    refreshTokenExpiresAt: timestamptz(),
    scope: text(),
    password: text(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index().on(t.userId)],
)

export const verifications = pgTable(
  'verifications',
  {
    id: uuid().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index().on(t.identifier)],
)

// The customer: a hotel group (decision 0003). Every domain row carries its id.
export const organizations = pgTable('organizations', {
  id: uuid().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logo: text(),
  metadata: text(),
  createdAt: created(),
})

export const members = pgTable(
  'members',
  {
    id: uuid().primaryKey(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text().notNull(),
    // Property access is closed by default: false means "only the properties in member_properties".
    allProperties: boolean().notNull().default(false),
    createdAt: created(),
  },
  (t) => [uniqueIndex().on(t.organizationId, t.userId), index().on(t.userId)],
)

export const invitations = pgTable(
  'invitations',
  {
    id: uuid().primaryKey(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    role: text(),
    status: text().notNull(),
    expiresAt: timestamptz().notNull(),
    inviterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Vento's invites (decision 0020): SHA-256 of the secret in the link, never the secret itself,
    // and which hotels the person will see (the list is in invitation_properties).
    tokenHash: text().unique(),
    allProperties: boolean().notNull().default(false),
    createdAt: created(),
  },
  (t) => [index().on(t.organizationId), index().on(t.email)],
)

// Authenticator secrets and backup codes for two-step sign-in (decision 0023). Better Auth encrypts
// the secret and the backup codes with the auth secret before storing them.
export const twoFactors = pgTable(
  'two_factors',
  {
    id: uuid().primaryKey(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: timestamptz(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index().on(t.userId), index().on(t.secret)],
)
