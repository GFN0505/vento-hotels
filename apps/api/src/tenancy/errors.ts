// Errors for hotels and companies, with the spec's wording and a `data.code` the web app can react
// to (spec: stage-1-hotels-and-companies.md, "Empty, error and edge cases").
import { ORPCError } from '@orpc/server'

export const SETUP_ONLY = 'Only the owner or a group admin can change hotel details. Ask the owner.'

// Unknown, in another group, or outside the caller's access: all look the same, so it never reveals
// that a hotel exists. The web app matches on the code, not the message.
export const hotelNotFound = () =>
  new ORPCError('NOT_FOUND', {
    message: "We couldn't find that hotel",
    data: { code: 'PROPERTY_NOT_FOUND' },
  })

export const companyNotFound = () =>
  new ORPCError('NOT_FOUND', { message: "We couldn't find that company" })

// For someone who could see the hotel before it was archived.
export const hotelArchived = () =>
  new ORPCError('NOT_FOUND', {
    message: 'This hotel was archived.',
    data: { code: 'PROPERTY_ARCHIVED' },
  })

export const hotelIsArchived = (name: string) =>
  new ORPCError('CONFLICT', {
    message: `${name} is archived. Restore it first.`,
    data: { code: 'PROPERTY_ARCHIVED' },
  })

export const hotelNameTaken = (taken: { name: string; archived: boolean }) =>
  new ORPCError('CONFLICT', {
    message: taken.archived
      ? `${taken.name} is archived. Restore it, or use another name.`
      : `${taken.name} is already a hotel in this group.`,
    data: { code: taken.archived ? 'NAME_ARCHIVED' : 'NAME_TAKEN' },
  })

export const companyNameTaken = (taken: { name: string; archived: boolean }) =>
  new ORPCError('CONFLICT', {
    message: taken.archived
      ? `${taken.name} is archived. Restore it, or use another name.`
      : `${taken.name} is already a company in this group.`,
    data: { code: taken.archived ? 'NAME_ARCHIVED' : 'NAME_TAKEN' },
  })

export const numberTaken = (field: 'rcNumber' | 'tin', value: string, owner: string) =>
  new ORPCError('CONFLICT', {
    message: `${value} belongs to ${owner}.`,
    data: { code: field === 'rcNumber' ? 'RC_NUMBER_TAKEN' : 'TIN_TAKEN', field },
  })

export const companyArchived = (name: string) =>
  new ORPCError('CONFLICT', {
    message: `${name} was archived. Choose another company.`,
    data: { code: 'ENTITY_ARCHIVED' },
  })

export const companyIsArchived = (name: string) =>
  new ORPCError('CONFLICT', {
    message: `${name} is archived. Restore it first.`,
    data: { code: 'ENTITY_ARCHIVED' },
  })

export const chooseCompany = () =>
  new ORPCError('BAD_REQUEST', {
    message: 'Choose a company from this group',
    data: { code: 'ENTITY_NOT_FOUND' },
  })

export const outsideAccess = (name: string) =>
  new ORPCError('FORBIDDEN', {
    message: `${name} also owns hotels outside your access. Ask the owner.`,
    data: { code: 'OUTSIDE_ACCESS' },
  })

export const companyOwnsHotels = (name: string, hotels: number) =>
  new ORPCError('CONFLICT', {
    message: `${name} owns ${hotels === 1 ? '1 hotel' : `${hotels} hotels`}. Move ${hotels === 1 ? 'it' : 'them'} to another company first.`,
    data: { code: 'ENTITY_OWNS_HOTELS', hotels },
  })

export const reasonRequired = (message: string) =>
  new ORPCError('BAD_REQUEST', { message, data: { code: 'REASON_REQUIRED' } })

export const staleVersion = (what: string, by: { name: string; at: string } | null) =>
  new ORPCError('CONFLICT', {
    message: by
      ? `${by.name} changed ${what} at ${by.at}. Reload to see the change, then save again.`
      : `Someone changed ${what} meanwhile. Reload to see the change, then save again.`,
    data: { code: 'STALE_VERSION', changedBy: by?.name ?? null, changedAt: by?.at ?? null },
  })

export const lastHotel = (group: string) =>
  new ORPCError('CONFLICT', {
    message: `${group} needs at least one hotel.`,
    data: { code: 'LAST_HOTEL' },
  })

export const storageOff = () =>
  new ORPCError('SERVICE_UNAVAILABLE', {
    message: "Uploads aren't set up on this server yet.",
    data: { code: 'STORAGE_OFF' },
  })

export const logoProblem = (code: 'LOGO_INVALID' | 'LOGO_NOT_UPLOADED', message: string) =>
  new ORPCError('BAD_REQUEST', { message, data: { code } })
