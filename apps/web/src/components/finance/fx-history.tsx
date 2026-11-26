// The FX history table: Date · Currency · Rate · Source · Entered by, server-paginated. Replaced
// rates stay, marked.
import { useQuery } from '@tanstack/react-query'
import { FX_SOURCE_LABELS, formatFxRate } from '@vento/shared'
import { useState } from 'react'
import { dateLabel } from '@/components/hotels/format'
import { RowsSkeleton } from '@/components/settings/load-states'
import { TD, TH } from '@/components/settings/table-styles'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'
import { orpc } from '@/lib/api'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 25

export function FxHistory() {
  const [page, setPage] = useState(1)
  const list = useQuery({
    ...orpc.fxRates.list.queryOptions({ input: { page, pageSize: PAGE_SIZE } }),
    placeholderData: (previous) => previous,
  })
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3.5 sm:px-5">
          <h2 className="font-semibold">History</h2>
        </div>
        {list.isPending ? (
          <RowsSkeleton rows={5} label="Loading FX history" />
        ) : list.isError ? (
          <p className="p-5 text-text-2">Couldn't load the history. Nothing changed.</p>
        ) : list.data.items.length === 0 ? (
          <p className="p-5 text-text-2">No rates entered yet.</p>
        ) : (
          <table
            className={cn(
              'w-full border-separate border-spacing-0 text-left max-md:block',
              list.isPlaceholderData && 'opacity-60',
            )}
          >
            <thead className="max-md:sr-only">
              <tr>
                <th scope="col" className={cn(TH, 'pl-5')}>
                  Date
                </th>
                <th scope="col" className={TH}>
                  Currency
                </th>
                <th scope="col" className={TH}>
                  Rate
                </th>
                <th scope="col" className={TH}>
                  Source
                </th>
                <th scope="col" className={cn(TH, 'pr-5')}>
                  Entered by
                </th>
              </tr>
            </thead>
            <tbody className="max-md:block max-md:divide-y max-md:divide-border">
              {list.data.items.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'max-md:flex max-md:flex-wrap max-md:gap-x-4 max-md:gap-y-1 max-md:px-4 max-md:py-3 md:[&>td]:border-b md:[&>td]:border-border md:last:[&>td]:border-0',
                    row.superseded && 'text-text-3',
                  )}
                >
                  <td className={cn(TD, 'num pl-5')}>{dateLabel(row.rateDate)}</td>
                  <td className={TD}>{row.currency}</td>
                  <td className={cn(TD, 'num font-medium')}>
                    ₦{formatFxRate(row.rate)}
                    {row.superseded ? <StatusBadge className="ml-2">Replaced</StatusBadge> : null}
                  </td>
                  <td className={TD}>{FX_SOURCE_LABELS[row.source]}</td>
                  <td className={cn(TD, 'pr-5 max-md:basis-full')}>
                    <span className="block truncate" title={row.replaceReason ?? undefined}>
                      {row.enteredByName}
                      {row.replaceReason ? ` · ${row.replaceReason}` : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {list.data ? (
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} />
      ) : null}
    </div>
  )
}
