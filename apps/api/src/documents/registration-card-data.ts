// The registration card's data (#21; printing skill): loaded org- and hotel-scoped from the stay's
// registrations, its room, terms and the tax rules in force on arrival, then handed to the builder
// as a RegistrationCardData. Only masked numbers ever reach it, and never the ID photo.
import {
  formatMoney,
  formatRateDate,
  ID_TYPE_LABELS,
  isForeign,
  nightsBetween,
  PORT_OF_ENTRY_LABELS,
  type RegistrationCardData,
  registrationCardTerms,
  stateCodeOf,
  VISA_TYPE_LABELS,
  VISIT_PURPOSE_LABELS,
} from '@vento/shared'
import { countryOf, demonymOf } from '@vento/shared/countries'
import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { guestRegistrations } from '../db/schema/front-desk.ts'
import { reservations, stayNights, stays } from '../db/schema/reservations.ts'
import { rooms, roomTypes } from '../db/schema/rooms.ts'
import { entities, properties } from '../db/schema/tenancy.ts'
import { rulesByNight } from '../finance/taxes.ts'
import type { StoredTerms } from '../reservations/change/load.ts'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? ''
const naira = (amount: string) => formatMoney({ amount, currency: 'NGN' })
const MEAL_WORDS: Record<string, string> = {
  room_only: 'room only',
  bed_breakfast: 'room & breakfast',
  half_board: 'half board',
  full_board: 'full board',
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

export async function registrationCardData(
  db: Pick<Database, 'select'>,
  scope: { organizationId: string; propertyId: string; stayId: string },
  print: { copy: number; byName: string; deviceName: string | null; at: Date },
): Promise<RegistrationCardData | null> {
  const [row] = await db
    .select({
      stay: stays,
      number: reservations.number,
      roomNumber: rooms.number,
      roomTypeName: roomTypes.name,
      hotelName: properties.name,
      prefix: properties.bookingPrefix,
      addressLine: properties.addressLine1,
      area: properties.area,
      lga: properties.lga,
      state: properties.state,
      timeZone: properties.timeZone,
      checkOutTime: properties.checkOutTime,
      businessDate: properties.businessDate,
      liveSince: properties.liveSince,
      entityId: properties.entityId,
      entityName: entities.name,
      rc: entities.rcNumber,
      tin: entities.tin,
    })
    .from(stays)
    .innerJoin(reservations, eq(reservations.id, stays.reservationId))
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .innerJoin(properties, eq(properties.id, stays.propertyId))
    .innerJoin(entities, eq(entities.id, properties.entityId))
    .leftJoin(rooms, eq(rooms.id, stays.roomId))
    .where(
      and(
        eq(stays.id, scope.stayId),
        eq(stays.organizationId, scope.organizationId),
        eq(stays.propertyId, scope.propertyId),
      ),
    )
  if (!row) return null
  const registrations = await db
    .select()
    .from(guestRegistrations)
    .where(
      and(
        eq(guestRegistrations.organizationId, scope.organizationId),
        eq(guestRegistrations.stayId, scope.stayId),
      ),
    )
    .orderBy(asc(guestRegistrations.createdAt))
  const lead = registrations.filter((r) => r.lead).at(-1)
  if (!lead) return null
  const companions = registrations.filter((r) => !r.lead && r.createdAt >= lead.createdAt)
  const stay = row.stay
  const terms = stay.terms as StoredTerms
  const [first] = await db
    .select({ soldPrice: stayNights.soldPrice })
    .from(stayNights)
    .where(and(eq(stayNights.stayId, stay.id), eq(stayNights.date, stay.arrival)))
  const rules = await rulesByNight(
    db,
    { organizationId: scope.organizationId },
    {
      id: scope.propertyId,
      name: row.hotelName,
      stateCode: stateCodeOf(row.state),
      businessDate: row.businessDate,
      live: row.liveSince !== null,
      archived: false,
      timeZone: row.timeZone,
      entityId: row.entityId,
      entityName: row.entityName,
      pendingEntityId: null,
      pendingEntityFrom: null,
    },
    [stay.arrival],
  ).catch(() => new Map())
  const taxes = (rules.get(stay.arrival) ?? []).map(
    (rule: { ratePercent: string; name: string }) => `${rule.ratePercent}% ${rule.name}`,
  )
  const nights = nightsBetween(stay.arrival, stay.departure)
  const party = [
    `${stay.adults} ${stay.adults === 1 ? 'adult' : 'adults'}`,
    ...(stay.children ? [`${stay.children} ${stay.children === 1 ? 'child' : 'children'}`] : []),
  ].join(', ')
  const checkOut = row.checkOutTime.slice(0, 5)
  const price = first ? naira(first.soldPrice) : ''
  const included = terms.pricesIncludeTaxes ? 'incl.' : 'excl.'
  const rate = `${price} per night${taxes.length ? `, ${included} ${listWords(taxes)}` : ''} · ${MEAL_WORDS[terms.mealPlan] ?? terms.planName}`
  const address = [lead.addressLine, lead.addressCity, lead.addressRegion]
    .filter(Boolean)
    .join(', ')
  const country = lead.addressCountry ? (countryOf(lead.addressCountry)?.name ?? '') : ''
  const guest = [
    {
      label: 'Full name',
      value: [lead.title, lead.firstName, lead.lastName].filter(Boolean).join(' '),
    },
    ...(lead.dateOfBirth
      ? [{ label: 'Date of birth', value: formatRateDate(lead.dateOfBirth) }]
      : []),
    { label: 'Nationality', value: demonymOf(lead.nationality) },
    ...(lead.phone ? [{ label: 'Phone', value: lead.phone }] : []),
    ...(lead.email ? [{ label: 'Email', value: lead.email }] : []),
    { label: 'Home address', value: [address, country].filter(Boolean).join(', ') || '–' },
    ...(lead.purpose
      ? [{ label: 'Purpose of visit', value: VISIT_PURPOSE_LABELS[lead.purpose] }]
      : []),
    {
      label: 'ID',
      value:
        lead.idType && lead.idNumberMasked
          ? `${ID_TYPE_LABELS[lead.idType]} ${lead.idNumberMasked}`
          : '–',
    },
    ...(lead.vehiclePlate ? [{ label: 'Vehicle plate', value: lead.vehiclePlate }] : []),
  ]
  const stayLines = [
    { label: 'Arrival', value: `${dayOf(stay.arrival)} ${formatRateDate(stay.arrival)}` },
    {
      label: 'Departure',
      value: `${dayOf(stay.departure)} ${formatRateDate(stay.departure)} · ${checkOut}`,
    },
    {
      label: 'Nights · guests',
      value: `${nights} ${nights === 1 ? 'night' : 'nights'} · ${party}`,
    },
    { label: 'Room', value: `${row.roomNumber ?? '–'} · ${row.roomTypeName}` },
    { label: 'Rate', value: rate },
  ]
  const foreign = isForeign(lead.nationality)
    ? [
        {
          label: 'Passport number',
          value: `${lead.idNumberMasked ?? '–'}${lead.idCountry ? ` · ${countryOf(lead.idCountry)?.name ?? lead.idCountry}` : ''}`,
        },
        { label: 'Passport expiry', value: lead.idExpiry ? formatRateDate(lead.idExpiry) : '–' },
        { label: 'Occupation', value: lead.occupation ?? '–' },
        {
          label: 'Visa or permit',
          value: lead.visaType
            ? [
                lead.visaType === 'other'
                  ? (lead.visaTypeText ?? 'Other')
                  : VISA_TYPE_LABELS[lead.visaType],
                lead.visaNumberMasked,
              ]
                .filter(Boolean)
                .join(' · ')
            : '–',
        },
        ...(lead.visaValidUntil
          ? [{ label: 'Valid until', value: formatRateDate(lead.visaValidUntil) }]
          : []),
        {
          label: 'Date and port of entry',
          value:
            [
              lead.entryDate ? formatRateDate(lead.entryDate) : null,
              lead.portOfEntry
                ? lead.portOfEntry === 'other'
                  ? (lead.portOfEntryText ?? 'Other')
                  : PORT_OF_ENTRY_LABELS[lead.portOfEntry]
                : null,
            ]
              .filter(Boolean)
              .join(' · ') || '–',
        },
        { label: 'Arriving from', value: lead.arrivingFrom ?? '–' },
        { label: 'Next destination', value: lead.nextDestination ?? '–' },
      ]
    : null
  const printedAt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: row.timeZone,
  })
    .format(print.at)
    .replace(',', '')
  const company = [
    row.entityName,
    row.rc ? `RC ${row.rc}` : null,
    row.tin ? `TIN ${row.tin}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    hotel: {
      name: row.hotelName,
      company,
      address: [row.addressLine, row.area, row.lga, row.state].filter(Boolean).join(', ') || null,
      phone: null,
    },
    cardNumber: lead.cardNumber ?? '',
    bookingNumber: row.number,
    copy: print.copy,
    guest,
    stay: stayLines,
    foreign,
    companions: companions.map((c) => `${c.firstName} ${c.lastName} · ${demonymOf(c.nationality)}`),
    terms: registrationCardTerms(checkOut),
    checkedInBy: stay.checkedInByName ?? lead.byName,
    businessDate: stay.checkedInBusinessDate ?? lead.businessDate,
    printedLine: `Printed ${printedAt} by ${print.byName}${print.deviceName ? ` · ${print.deviceName}` : ''}`,
  }
}
