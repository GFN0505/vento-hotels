// The company sheet's form (spec: "Add or edit a company"): values as typed, the checks on save,
// how RC numbers and TINs will be stored, and only what changed for an edit.
import { type Entity, normalizeRcNumber, normalizeTin } from '@vento/shared'

export type CompanyForm = {
  name: string
  rcNumber: string
  tin: string
  vatRegistered: boolean
  reason: string
}

export type CompanyProblems = Partial<Record<keyof CompanyForm | 'form', string>>

export const COMPANY_FIELDS: readonly (keyof CompanyForm)[] = ['name', 'rcNumber', 'tin', 'reason']

export function companyForm(company?: Entity): CompanyForm {
  return {
    name: company?.name ?? '',
    rcNumber: company?.rcNumber ?? '',
    tin: company?.tin ?? '',
    // A waiting VAT change shows as the value it's heading for (choosing the other cancels it).
    vatRegistered: company ? vatHeading(company) : false,
    reason: '',
  }
}

export function vatHeading(company: Pick<Entity, 'vatRegistered' | 'pendingVat'>): boolean {
  return company.pendingVat?.vatRegistered ?? company.vatRegistered
}

export function nameProblem(value: string): string | undefined {
  const name = value.trim()
  if (name.length < 2) return 'Enter at least 2 characters'
  if (name.length > 120) return 'Use 120 characters or fewer'
  return undefined
}

export function rcProblem(value: string): string | undefined {
  if (!value.trim()) return undefined
  return normalizeRcNumber(value) ? undefined : 'Use a CAC number like RC 1184402 or BN 3456789'
}

export function tinProblem(value: string): string | undefined {
  if (!value.trim()) return undefined
  return normalizeTin(value) ? undefined : 'Use 8 to 14 digits, like 21847390-0001'
}

// "Saved as RC 1184402" once what's typed reads differently from how it's stored.
export function storedAs(value: string, normalize: (input: string) => string | null) {
  const typed = value.trim()
  const stored = typed ? normalize(typed) : null
  return stored && stored !== typed ? `Saved as ${stored}` : undefined
}

const stored = (value: string, normalize: (input: string) => string | null) =>
  value.trim() ? normalize(value) : null

// Changing the TIN or VAT registration of a company that owns a live hotel needs a reason: it
// shows in the owner's daily report.
export function companyNeedsReason(company: Entity | undefined, form: CompanyForm): boolean {
  if (!company?.ownsLiveHotel) return false
  return (
    stored(form.tin, normalizeTin) !== company.tin || form.vatRegistered !== vatHeading(company)
  )
}

export function checkCompany(form: CompanyForm, company?: Entity): CompanyProblems {
  const found: [keyof CompanyForm, string | undefined][] = [
    ['name', nameProblem(form.name)],
    ['rcNumber', rcProblem(form.rcNumber)],
    ['tin', tinProblem(form.tin)],
    [
      'reason',
      companyNeedsReason(company, form) && form.reason.trim().length < 3
        ? 'Say why, in a few words'
        : undefined,
    ],
  ]
  const problems: CompanyProblems = {}
  for (const [field, message] of found) if (message) problems[field] = message
  return problems
}

export function createInput(form: CompanyForm) {
  return {
    name: form.name.trim(),
    vatRegistered: form.vatRegistered,
    ...(form.rcNumber.trim() ? { rcNumber: form.rcNumber.trim() } : {}),
    ...(form.tin.trim() ? { tin: form.tin.trim() } : {}),
  }
}

// Only the fields that changed; an emptied RC number or TIN is cleared (null).
export function updateInput(company: Entity, form: CompanyForm) {
  const rc = stored(form.rcNumber, normalizeRcNumber)
  const tin = stored(form.tin, normalizeTin)
  return {
    id: company.id,
    version: company.version,
    ...(form.name.trim() !== company.name ? { name: form.name.trim() } : {}),
    ...(rc !== company.rcNumber ? { rcNumber: form.rcNumber.trim() || null } : {}),
    ...(tin !== company.tin ? { tin: form.tin.trim() || null } : {}),
    ...(form.vatRegistered !== vatHeading(company) ? { vatRegistered: form.vatRegistered } : {}),
    ...(companyNeedsReason(company, form) ? { reason: form.reason.trim() } : {}),
  }
}

export function companyDirty(form: CompanyForm, company?: Entity): boolean {
  return JSON.stringify({ ...form, reason: '' }) !== JSON.stringify(companyForm(company))
}

// "Kora Victoria Island, Kora Ikeja GRA + 1 other hotel", or "No hotels".
export function hotelsLine(company: Pick<Entity, 'hotels' | 'otherHotels'>): string {
  const names = company.hotels.map((hotel) => hotel.name)
  if (company.otherHotels > 0) {
    names.push(`${company.otherHotels} other ${company.otherHotels === 1 ? 'hotel' : 'hotels'}`)
    if (names.length > 1) return `${names.slice(0, -1).join(', ')} + ${names.at(-1)}`
  }
  return names.length > 0 ? names.join(', ') : 'No hotels'
}

export function detailsMissing(company: Pick<Entity, 'rcNumber' | 'tin'>): boolean {
  return !company.rcNumber || !company.tin
}

// "RC number and TIN missing", or just the one that is.
export function missingLabel(company: Pick<Entity, 'rcNumber' | 'tin'>): string {
  if (!company.rcNumber && !company.tin) return 'RC number and TIN missing'
  return company.rcNumber ? 'TIN missing' : 'RC number missing'
}
