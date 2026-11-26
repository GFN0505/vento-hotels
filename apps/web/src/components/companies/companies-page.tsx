// Settings › Companies (design #25 SetEntities; spec: "Settings › Companies"): the group's legal
// entities, shown as companies. With one hotel chosen in the top bar, only the company that owns it.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Entity } from '@vento/shared'
import { Building, Plus } from 'lucide-react'
import { useState } from 'react'
import { PAGE_SIZE } from '@/components/hotels/queries'
import { LoadError, RowsSkeleton } from '@/components/settings/load-states'
import { NEEDS_CONNECTION, SettingsOffline } from '@/components/settings/offline-note'
import { type Show, StatusChips } from '@/components/settings/status-chips'
import { useProperty } from '@/components/shell/property-context'
import { NoAccess } from '@/components/team/no-access'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { orpc } from '@/lib/api'
import { useMe } from '@/lib/me'
import { usePageTitle } from '@/lib/title'
import { useOnline } from '@/offline/connection'
import { CompaniesTable } from './companies-table'
import { RestoreCompany } from './company-archive'
import { CompanySheet } from './company-sheet'

export type CompaniesSearch = {
  show?: 'archived' | undefined
  page?: number | undefined
  sheet?: 'add' | 'edit' | undefined
  id?: string | undefined
}

type Props = {
  search: CompaniesSearch
  onSearch: (patch: Partial<CompaniesSearch>, options?: { push?: boolean }) => void
}

export function CompaniesPage({ search, onSearch }: Props) {
  const me = useMe()
  const online = useOnline()
  const { current, allHotels, canSeeAll } = useProperty()
  // One hotel chosen by someone who could choose the whole group: just the company that owns it.
  const scoped = canSeeAll && !allHotels && current ? current : undefined
  usePageTitle(`${scoped ? scoped.name : 'All hotels'} · Companies`)
  const [restoring, setRestoring] = useState<Entity>()
  const page = search.page ?? 1
  const list = useQuery({
    ...orpc.entities.list.queryOptions({
      input: {
        status: scoped ? 'active' : (search.show ?? 'active'),
        page,
        pageSize: PAGE_SIZE,
        propertyId: scoped?.id,
      },
    }),
    enabled: me.can('setup.manage'),
    placeholderData: keepPreviousData,
  })

  if (me.isPending) return <RowsSkeleton rows={3} label="Loading companies" />
  if (!me.can('setup.manage')) return <NoAccess what="companies" />

  const group = me.data?.organization.name ?? ''
  const open = list.data?.items.find((company) => company.id === search.id)
  const archived = search.show === 'archived' && !scoped
  const owner = scoped ? list.data?.items[0] : undefined
  const description = scoped
    ? owner
      ? `${scoped.name} is owned by ${owner.name}. Choose All hotels in the top bar to see every company.`
      : `The company that owns ${scoped.name}.`
    : list.data && !archived
      ? `${group} · ${list.data.total === 1 ? '1 company' : `${list.data.total} companies`}`
      : group

  return (
    <div className="flex flex-col gap-5">
      <SettingsOffline />
      <PageHeader
        title="Companies"
        description={description}
        actions={
          <span className="flex items-center gap-3">
            {!online ? <span className="text-sm text-text-3">{NEEDS_CONNECTION}</span> : null}
            <Button
              variant="primary"
              size="lg"
              className="max-lg:h-11"
              disabled={!online}
              onClick={() => onSearch({ sheet: 'add', id: undefined }, { push: true })}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add a company
            </Button>
          </span>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="font-semibold">Legal entities</h2>
          {scoped ? null : (
            <StatusChips show={search.show} onShow={(show: Show) => onSearch({ show })} />
          )}
        </div>
        {list.isPending ? (
          <RowsSkeleton rows={3} label="Loading companies" />
        ) : list.isError && !list.data ? (
          <div className="p-4">
            <LoadError onRetry={() => list.refetch()} retrying={list.isFetching} />
          </div>
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={Building}
            className="m-4 border-dashed shadow-none"
            action={
              archived ? (
                <Button className="max-lg:h-11" onClick={() => onSearch({ show: undefined })}>
                  Show active
                </Button>
              ) : undefined
            }
          >
            {archived ? 'No archived companies.' : 'No companies yet.'}
          </EmptyState>
        ) : (
          <CompaniesTable
            companies={list.data.items}
            dimmed={list.isPlaceholderData}
            canWrite={online}
            onOpen={(company) => onSearch({ sheet: 'edit', id: company.id }, { push: true })}
            onRestore={setRestoring}
          />
        )}
      </Card>
      {list.data ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={list.data.total}
          onPage={(next) => onSearch({ page: next }, { push: true })}
        />
      ) : null}

      {search.sheet === 'add' ? (
        <CompanySheet onClose={() => onSearch({ sheet: undefined, id: undefined })} />
      ) : null}
      {search.sheet === 'edit' && open ? (
        <CompanySheet
          key={open.id}
          company={open}
          onClose={() => onSearch({ sheet: undefined, id: undefined })}
        />
      ) : null}
      {restoring ? (
        <RestoreCompany company={restoring} onClose={() => setRestoring(undefined)} />
      ) : null}
    </div>
  )
}
