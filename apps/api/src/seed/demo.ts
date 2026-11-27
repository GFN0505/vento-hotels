// The demo world from docs/journeys/README.md: Kora Hotels Group, its three companies, four hotels
// (Kora Victoria Island with a placeholder logo when storage is given) and the people in the
// walkthroughs, each with a role, hotels, a sign-in and a staff PIN; room types and 382 rooms;
// rate plans (Kora Victoria Island's five with the Festive season, the others' three each);
// devices at Kora Victoria Island and Kora Ikeja GRA (none at Abuja or Port Harcourt, for the empty
// state); taxes, payment methods, bank accounts, POS terminals and 30 days of FX rates; about 430
// reservations at Kora Victoria Island and 20 at Kora Ikeja GRA; a pending
// invite; and one permission change with its reason. Used for local development, browser tests and sales demos. Everything here is
// made up.
import { createHash, randomBytes } from 'node:crypto'
import { addDays, calendarDateIn, type DeviceKind, type MemberRole, newId } from '@vento/shared'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { type Actor, recordAudit } from '../audit/record.ts'
import type { Database } from '../db/client.ts'
import { accounts, invitations, members, organizations, users } from '../db/schema/auth.ts'
import { permissionOverrides } from '../db/schema/governance.ts'
import {
  devices,
  entities,
  invitationProperties,
  memberPins,
  memberProperties,
  properties,
} from '../db/schema/tenancy.ts'
import type { StorageProvider } from '../providers/storage.ts'
import { seedApprovals } from './approvals.ts'
import { seedFinance } from './finance.ts'
import { seedLogo } from './logo.ts'
import { seedRates } from './rates.ts'
import { accessFor, seedReservations } from './reservations.ts'
import { seedRooms } from './rooms.ts'

// The demo hotels went live on Vento this many business days before the seed was loaded.
export const LIVE_DAYS_AGO = 10

type HotelKey = 'vi' | 'ikeja' | 'abuja' | 'ph'

type CompanyKey = 'hospitality' | 'abuja' | 'ph'

// The three companies from the designs (spec: stage-1-hotels-and-companies.md, "Demo seed").
const COMPANIES: Record<CompanyKey, { name: string; rcNumber: string; tin: string }> = {
  hospitality: { name: 'Kora Hospitality Ltd', rcNumber: 'RC 1184402', tin: '21847390-0001' },
  abuja: { name: 'Kora Hotels Abuja Ltd', rcNumber: 'RC 1290517', tin: '22910455-0001' },
  ph: { name: 'Kora PH Ltd', rcNumber: 'RC 1377281', tin: '23308817-0001' },
}

// Kora Ikeja GRA has no street, so completing a hotel's address can be tried on it.
const HOTELS: Record<
  HotelKey,
  {
    name: string
    // Booking prefixes from the reservations spec (Open question 5).
    prefix: string
    company: CompanyKey
    street: string | null
    area: string
    lga: string
    state: string
    rooms: number
  }
> = {
  vi: {
    name: 'Kora Victoria Island',
    prefix: 'VI',
    company: 'hospitality',
    street: 'Plot 1412 Ahmadu Bello Way',
    area: 'Victoria Island',
    lga: 'Eti-Osa',
    state: 'Lagos',
    rooms: 120,
  },
  ikeja: {
    name: 'Kora Ikeja GRA',
    prefix: 'IKJ',
    company: 'hospitality',
    street: null,
    area: 'Ikeja GRA',
    lga: 'Ikeja',
    state: 'Lagos',
    rooms: 86,
  },
  abuja: {
    name: 'Kora Abuja',
    prefix: 'ABJ',
    company: 'abuja',
    street: 'Plot 12 Aminu Kano Crescent',
    area: 'Wuse 2',
    lga: 'Abuja Municipal',
    state: 'FCT (Abuja)',
    rooms: 104,
  },
  ph: {
    name: 'Kora Port Harcourt',
    prefix: 'PH',
    company: 'ph',
    street: '15 Tombia Street',
    area: 'GRA Phase 2',
    lga: 'Obio-Akpor',
    state: 'Rivers',
    rooms: 72,
  },
}

// Who's who (docs/journeys/README.md). `hotels: 'all'` sees the whole group.
const PEOPLE: {
  name: string
  email: string
  role: MemberRole
  hotels: 'all' | HotelKey[]
  pin: string
}[] = [
  { name: 'Adaeze Okafor', email: 'adaeze', role: 'owner', hotels: 'all', pin: '8391' },
  { name: 'Tunde Bello', email: 'tunde', role: 'general_manager', hotels: ['vi'], pin: '5072' },
  { name: 'Chiamaka Eze', email: 'chiamaka', role: 'front_desk', hotels: ['vi'], pin: '2948' },
  { name: 'Ibrahim Musa', email: 'ibrahim', role: 'front_desk', hotels: ['vi'], pin: '6153' },
  { name: 'Blessing Udo', email: 'blessing', role: 'room_attendant', hotels: ['vi'], pin: '3807' },
  {
    name: 'Grace Akpan',
    email: 'grace',
    role: 'housekeeping_supervisor',
    hotels: ['vi'],
    pin: '4719',
  },
  { name: 'Emeka Nwosu', email: 'emeka', role: 'waiter', hotels: ['vi'], pin: '1586' },
  { name: 'Halima Yusuf', email: 'halima', role: 'cashier', hotels: ['vi'], pin: '9264' },
  { name: 'Femi Adeyemi', email: 'femi', role: 'fnb_manager', hotels: ['vi'], pin: '7430' },
  { name: 'Kunle Ade', email: 'kunle', role: 'finance', hotels: 'all', pin: '2671' },
  // The member with 2 of 4 hotels: a hotel switch without All hotels.
  {
    name: 'Sade Bakare',
    email: 'sade',
    role: 'revenue_manager',
    hotels: ['vi', 'ikeja'],
    pin: '6294',
  },
]

const DEVICES: { name: string; kind: DeviceKind; hotel: HotelKey }[] = [
  { name: 'FD-VI-01', kind: 'front_desk', hotel: 'vi' },
  { name: 'POS-VI-03', kind: 'pos', hotel: 'vi' },
  { name: 'HK-VI-07', kind: 'housekeeping', hotel: 'vi' },
  { name: 'FD-IKJ-01', kind: 'front_desk', hotel: 'ikeja' },
]

export type SeedOptions = {
  password: string
  // Where the placeholder logo goes. Without storage the demo has no logo, and nothing else changes.
  storage?: StorageProvider | undefined
  // Tests use their own slug and email domain so they never collide with a seeded dev database.
  slug?: string
  emailDomain?: string
}

export type SeedResult =
  | {
      status: 'seeded'
      organizationId: string
      people: { name: string; email: string; role: MemberRole; pin: string }[]
    }
  | { status: 'exists'; organizationId: string }

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export async function seedDemo(db: Database, options: SeedOptions): Promise<SeedResult> {
  const slug = options.slug ?? 'kora-hotels-group'
  const domain = options.emailDomain ?? 'kora.example'
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
  if (existing) return { status: 'exists', organizationId: existing.id }

  const passwordHash = await hashPassword(options.password)
  const pinHashes = await Promise.all(PEOPLE.map((person) => hashPassword(person.pin)))

  const result = await db.transaction(async (tx) => {
    const organizationId = newId()
    await tx.insert(organizations).values({ id: organizationId, name: 'Kora Hotels Group', slug })

    const companyIds = {} as Record<CompanyKey, string>
    for (const [key, company] of Object.entries(COMPANIES) as [
      CompanyKey,
      (typeof COMPANIES)[CompanyKey],
    ][]) {
      companyIds[key] = newId()
      await tx.insert(entities).values({
        id: companyIds[key],
        organizationId,
        ...company,
        vatRegistered: true,
      })
    }

    const hotelIds = {} as Record<HotelKey, string>
    const businessDate = calendarDateIn('Africa/Lagos')
    for (const [key, hotel] of Object.entries(HOTELS) as [HotelKey, (typeof HOTELS)[HotelKey]][]) {
      hotelIds[key] = newId()
      await tx.insert(properties).values({
        id: hotelIds[key],
        organizationId,
        entityId: companyIds[hotel.company],
        name: hotel.name,
        bookingPrefix: hotel.prefix,
        addressLine1: hotel.street,
        area: hotel.area,
        lga: hotel.lga,
        state: hotel.state,
        businessDate,
        // Live on Vento since the night audit 10 days ago (going-live.md: the first audit closes
        // 16 Nov 2026), so room changes ask for a reason in the demo.
        liveSince: addDays(businessDate, -LIVE_DAYS_AGO),
      })
    }

    const seeded: {
      name: string
      email: string
      role: MemberRole
      pin: string
      memberId: string
      userId: string
    }[] = []
    for (const [index, person] of PEOPLE.entries()) {
      const userId = newId()
      const memberId = newId()
      const email = `${person.email}@${domain}`
      await tx.insert(users).values({ id: userId, name: person.name, email, emailVerified: true })
      await tx.insert(accounts).values({
        id: newId(),
        userId,
        providerId: 'credential',
        accountId: userId,
        password: passwordHash,
      })
      await tx.insert(members).values({
        id: memberId,
        organizationId,
        userId,
        role: person.role,
        allProperties: person.hotels === 'all',
      })
      if (person.hotels !== 'all') {
        await tx
          .insert(memberProperties)
          .values(
            person.hotels.map((key) => ({ organizationId, memberId, propertyId: hotelIds[key] })),
          )
      }
      await tx
        .insert(memberPins)
        .values({ organizationId, memberId, pinHash: pinHashes[index] ?? '' })
      seeded.push({ ...person, email, memberId, userId })
    }

    const owner = seeded[0]
    if (!owner) throw new Error('The demo needs an owner')
    const actor: Actor = {
      organizationId,
      userId: owner.userId,
      memberId: owner.memberId,
      userName: owner.name,
    }

    const hotels = Object.fromEntries(
      (Object.keys(HOTELS) as HotelKey[]).map((key) => [key, { id: hotelIds[key], businessDate }]),
    ) as Record<HotelKey, { id: string; businessDate: string }>
    const roomCount = await seedRooms(tx, actor, organizationId, hotels)
    const expected = Object.values(HOTELS).reduce((sum, hotel) => sum + hotel.rooms, 0)
    if (roomCount !== expected) throw new Error(`Seeded ${roomCount} rooms, expected ${expected}`)
    // Kora Victoria Island's five plans and the other hotels' three each.
    // Rates were set up in setup week (going-live.md step 4, 13 Nov for a 16 Nov go-live), so their
    // events carry that business date and liveProperty: false, consistent with liveSince.
    const setupWeek = Object.fromEntries(
      Object.entries(hotels).map(([key, hotel]) => [
        key,
        { ...hotel, businessDate: addDays(businessDate, -(LIVE_DAYS_AGO + 3)) },
      ]),
    ) as typeof hotels
    const planCount = await seedRates(tx, actor, organizationId, setupWeek)
    if (planCount !== 14) throw new Error(`Seeded ${planCount} rate plans, expected 14`)

    // Taxes, payment setup and FX rates, set up by Kunle Ade (finance).
    const kunle = seeded.find((person) => person.role === 'finance')
    if (!kunle) throw new Error('The demo needs Kunle Ade (finance)')
    await seedFinance(
      tx,
      { organizationId, userId: kunle.userId, memberId: kunle.memberId, userName: kunle.name },
      { organizationId, hotels: hotelIds, companies: companyIds, businessDate },
    )

    // Shared devices. Their secrets are random and thrown away: to use one, register a real
    // browser from Settings › Devices.
    const deviceIds = new Map<string, string>()
    for (const device of DEVICES) {
      const deviceId = newId()
      deviceIds.set(device.name, deviceId)
      await tx.insert(devices).values({
        id: deviceId,
        organizationId,
        propertyId: hotelIds[device.hotel],
        name: device.name,
        kind: device.kind,
        tokenHash: sha256(randomBytes(32).toString('base64url')),
        lastSeenAt: new Date(),
      })
      await recordAudit(tx, actor, {
        action: 'device.registered',
        entityType: 'device',
        entityId: deviceId,
        propertyId: hotelIds[device.hotel],
        after: { name: device.name, kind: device.kind, propertyName: HOTELS[device.hotel].name },
      })
    }

    // A GM for Kora Abuja, invited and not yet joined.
    const invitationId = newId()
    await tx.insert(invitations).values({
      id: invitationId,
      organizationId,
      email: `ngozi@${domain}`,
      role: 'general_manager',
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      inviterId: owner.userId,
      tokenHash: sha256(randomBytes(32).toString('base64url')),
      allProperties: false,
    })
    await tx.insert(invitationProperties).values({
      organizationId,
      invitationId,
      propertyId: hotelIds.abuja,
    })
    await recordAudit(tx, actor, {
      action: 'member.invited',
      entityType: 'invitation',
      entityId: invitationId,
      after: {
        email: `ngozi@${domain}`,
        role: 'general_manager',
        allProperties: false,
        propertyIds: [hotelIds.abuja],
      },
    })

    // The owner gave front desk a little more room on discounts, with a reason.
    await tx.insert(permissionOverrides).values({
      organizationId,
      role: 'front_desk',
      permission: 'stay.rate_override',
      allowed: true,
      limitValue: '12.00',
    })
    await recordAudit(tx, actor, {
      action: 'permission.changed',
      entityType: 'permission',
      before: {
        role: 'front_desk',
        permission: 'stay.rate_override',
        allowed: true,
        limit: '10.00',
      },
      after: {
        role: 'front_desk',
        permission: 'stay.rate_override',
        allowed: true,
        limit: '12.00',
      },
      reason: 'Weekend corporate guests ask for a little more',
    })

    // Reservations, booked through the booking service by the desk, revenue and the GM.
    const who = (email: string) => {
      const found = seeded.find((person) => person.email === `${email}@${domain}`)
      if (!found) throw new Error(`The demo needs ${email}`)
      return { userId: found.userId, memberId: found.memberId, name: found.name, role: found.role }
    }
    const booking = { organizationId, hotels: { vi: hotelIds.vi, ikeja: hotelIds.ikeja } }
    await seedReservations(tx, {
      ...booking,
      businessDate,
      people: { chiamaka: who('chiamaka'), sade: who('sade'), tunde: who('tunde') },
    })

    // Approvals: over-limit discounts approved, declined and expired (stage-1-approvals.md).
    const actorOf = (email: string): Actor => {
      const person = who(email)
      return {
        organizationId,
        userId: person.userId,
        memberId: person.memberId,
        userName: person.name,
      }
    }
    await seedApprovals(tx, {
      organizationId,
      businessDate,
      hotels: booking.hotels,
      deviceId: deviceIds.get('FD-VI-01') ?? '',
      deviceName: 'FD-VI-01',
      access: {
        chiamaka: await accessFor(tx, booking, who('chiamaka')),
        ibrahim: await accessFor(tx, booking, who('ibrahim')),
        sade: await accessFor(tx, booking, who('sade')),
      },
      approvers: { tunde: actorOf('tunde'), adaeze: actorOf('adaeze') },
      limits: { tunde: '50.00', adaeze: null },
    })

    return {
      status: 'seeded' as const,
      organizationId,
      viId: hotelIds.vi,
      ownerMemberId: owner.memberId,
      people: seeded.map(({ name, email, role, pin }) => ({ name, email, role, pin })),
    }
  })
  // After the group is saved: storage is outside the database, so it's never written mid-transaction.
  if (options.storage) {
    await seedLogo(db, options.storage, {
      organizationId: result.organizationId,
      propertyId: result.viId,
      memberId: result.ownerMemberId,
    })
  }
  return { status: result.status, organizationId: result.organizationId, people: result.people }
}
