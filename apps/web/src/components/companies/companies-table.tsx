// The companies table (design #25 SetEntities, "Legal entities"): company, RC number, TIN, VAT,
// hotels and status. Each row opens the company; on phones each row reads as a card.
import type { Entity } from '@vento/shared'
import { ChevronRight } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/cn'
import { detailsMissing, hotelsLine, missingLabel } from './company-form-model'

type Props = {
  companies: readonly Entity[]
  dimmed: boolean
  onOpen: (company: Entity) => void
  onRestore: (company: Entity) => void
  canWrite: boolean
}

const th = 'border-b border-border bg-surface-2 px-3 py-2 text-xs font-medium text-text-3'
const td = 'px-3 py-3 align-middle max-md:p-0'

export function CompaniesTable({ companies, dimmed, onOpen, onRestore, canWrite }: Props) {
  return (
    <table
      className={cn(
        'w-full table-fixed border-separate border-spacing-0 text-left transition-opacity max-md:block',
        dimmed && 'opacity-60',
      )}
    >
      <thead className="max-md:sr-only">
        <tr>
          <th scope="col" className={cn(th, 'pl-5')}>
            Company
          </th>
          <th scope="col" className={cn(th, 'w-32')}>
            RC number
          </th>
          <th scope="col" className={cn(th, 'w-36')}>
            TIN
          </th>
          <th scope="col" className={cn(th, 'w-16')}>
            VAT
          </th>
          <th scope="col" className={cn(th, 'w-[26%]')}>
            Hotels
          </th>
          <th scope="col" className={cn(th, 'w-32 pr-5')}>
            Status
          </th>
        </tr>
      </thead>
      <tbody className="max-md:block max-md:divide-y max-md:divide-border">
        {companies.map((company) => {
          const archived = company.status === 'archived'
          const hotels = hotelsLine(company)
          return (
            <tr
              key={company.id}
              className="group max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-3 md:[&>td]:border-b md:[&>td]:border-border md:last:[&>td]:border-0"
            >
              <td className={cn(td, 'pl-5 max-md:basis-full')}>
                <button
                  type="button"
                  onClick={() => onOpen(company)}
                  className="flex min-h-11 w-full min-w-0 items-center gap-2 text-left font-medium hover:text-pri-ink md:min-h-0"
                >
                  <span className="truncate" title={company.name}>
                    {company.name}
                  </span>
                  <ChevronRight
                    className="ml-auto size-4 flex-none text-text-3 md:hidden"
                    aria-hidden="true"
                  />
                </button>
              </td>
              <td className={cn(td, 'num text-text-2')}>
                <span className="md:sr-only">RC </span>
                {company.rcNumber ?? <Missing />}
              </td>
              <td className={cn(td, 'num text-text-2')}>
                <span className="md:sr-only">TIN </span>
                {company.tin ?? <Missing />}
              </td>
              <td className={cn(td, 'text-text-2')}>
                <span className="md:sr-only">VAT </span>
                {company.vatRegistered ? 'Yes' : 'No'}
              </td>
              <td className={cn(td, 'text-text-2 max-md:basis-full')}>
                <span className="block truncate" title={hotels}>
                  {hotels}
                </span>
              </td>
              <td className={cn(td, 'pr-5')}>
                {archived ? (
                  <span className="flex items-center gap-2">
                    <StatusBadge>Archived</StatusBadge>
                    {canWrite && company.canEdit ? (
                      <button
                        type="button"
                        onClick={() => onRestore(company)}
                        aria-label={`Restore ${company.name}`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-pri-ink hover:underline md:min-h-0"
                      >
                        Restore
                      </button>
                    ) : null}
                  </span>
                ) : detailsMissing(company) ? (
                  <StatusBadge tone="amber" className="whitespace-normal">
                    {missingLabel(company)}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="emerald">Active</StatusBadge>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Missing() {
  return <span className="text-text-3">Not set</span>
}
