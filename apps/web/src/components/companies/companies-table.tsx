// The companies table (design #25 SetEntities, "Legal entities"): company, RC number, TIN, VAT,
// hotels and status. The whole row opens the company (keyboards use its name's button). On phones
// each row is a card with small labels, since the column names are hidden.
import type { Entity } from '@vento/shared'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { dateLabel } from '@/components/hotels/format'
import { TD, TH } from '@/components/settings/table-styles'
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
          <th scope="col" className={cn(TH, 'w-[26%] min-w-48 pl-5')}>
            Company
          </th>
          <th scope="col" className={cn(TH, 'w-32')}>
            RC number
          </th>
          <th scope="col" className={cn(TH, 'w-36')}>
            TIN
          </th>
          <th scope="col" className={cn(TH, 'w-16')}>
            VAT
          </th>
          <th scope="col" className={TH}>
            Hotels
          </th>
          <th scope="col" className={cn(TH, 'w-44')}>
            Status
          </th>
          <th scope="col" className={cn(TH, 'w-12 pr-5')}>
            <span className="sr-only">Open</span>
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
              onClick={() => onOpen(company)}
              className="group/row cursor-pointer hover:bg-surface-2/60 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-5 max-md:gap-y-1.5 max-md:px-4 max-md:py-3 md:[&>td]:border-b md:[&>td]:border-border md:last:[&>td]:border-0"
            >
              <td className={cn(TD, 'pl-5 max-md:max-w-full max-md:basis-full')}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpen(company)
                  }}
                  className="flex min-h-11 w-full min-w-0 items-center gap-2 text-left font-medium group-hover/row:text-pri-ink md:min-h-0"
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
              <td className={cn(TD, 'num text-text-2')}>
                <Small label="RC number">{company.rcNumber ?? <Missing />}</Small>
              </td>
              <td className={cn(TD, 'num text-text-2')}>
                <Small label="TIN">{company.tin ?? <Missing />}</Small>
              </td>
              <td className={cn(TD, 'text-text-2')}>
                <Small label="VAT registered">
                  {company.vatRegistered ? 'Yes' : 'No'}
                  {company.pendingVat ? (
                    <span className="block text-sm text-text-3">
                      {company.pendingVat.vatRegistered ? 'Yes' : 'No'} from{' '}
                      {dateLabel(company.pendingVat.from)}
                    </span>
                  ) : null}
                </Small>
              </td>
              <td className={cn(TD, 'text-text-2 max-md:basis-full')}>
                {/* Lines break between hotels, never inside a name. */}
                <span className="block min-w-0">
                  {hotels.split(', ').map((name, index, all) => (
                    <span key={name} className="whitespace-nowrap">
                      {name}
                      {index < all.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </span>
              </td>
              <td className={TD}>
                {archived ? (
                  <span className="flex items-center gap-2">
                    <StatusBadge>Archived</StatusBadge>
                    {canWrite && company.canEdit ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onRestore(company)
                        }}
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
              <td className={cn(TD, 'pr-5 max-md:hidden')}>
                <ChevronRight
                  className="ml-auto size-4 text-text-3 transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-pri-ink"
                  aria-hidden="true"
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// A small muted label above the value on phones, where the column names are hidden.
function Small({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] leading-4 font-semibold tracking-[0.05em] text-text-3 uppercase md:sr-only">
        {label}
      </span>
      <span>{children}</span>
    </span>
  )
}

function Missing() {
  return <span className="text-text-3">Not set</span>
}
