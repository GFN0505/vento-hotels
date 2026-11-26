// "Owning company": one of the group's active companies, and last, "Add a company", which opens the
// company sheet and comes back with the new company chosen (spec: "Fields · Owning company").
import type { Entity } from '@vento/shared'
import type { ReactNode } from 'react'
import { SelectField } from '@/components/ui/select-field'

const ADD = '__add-company'

export const COMPANY_HINT = 'Invoices, VAT and the ledger use this company'

type Props = {
  value: string
  companies: readonly Entity[]
  // A company that isn't in the active list (archived meanwhile, or the hotel's own when loading).
  fallback?: { id: string; name: string } | undefined
  disabled?: boolean
  error?: string | undefined
  hint?: ReactNode
  onChange: (entityId: string) => void
  onAddCompany: () => void
}

export function CompanySelect({
  value,
  companies,
  fallback,
  disabled,
  error,
  hint = COMPANY_HINT,
  onChange,
  onAddCompany,
}: Props) {
  const options = companies.map((company) => ({ value: company.id, label: company.name }))
  if (fallback && !options.some((option) => option.value === fallback.id)) {
    options.unshift({ value: fallback.id, label: fallback.name })
  }
  return (
    <SelectField
      label="Owning company"
      name="entityId"
      value={value}
      {...(value ? {} : { placeholder: 'Choose a company' })}
      options={[...options, { value: ADD, label: 'Add a company…' }]}
      disabled={disabled}
      hint={hint}
      error={error}
      onChange={(event) =>
        event.target.value === ADD ? onAddCompany() : onChange(event.target.value)
      }
      className="lg:h-9 lg:text-base"
    />
  )
}

// The company a new hotel starts with: the only one, or the one that owns the most hotels.
export function defaultCompany(companies: readonly Entity[]): string {
  let best: Entity | undefined
  for (const company of companies) {
    const owns = company.hotels.length + company.otherHotels
    if (!best || owns > best.hotels.length + best.otherHotels) best = company
  }
  return best?.id ?? ''
}
