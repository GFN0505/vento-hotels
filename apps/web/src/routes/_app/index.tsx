// Home for now: the group's hotels. The real home screens (group executive home, property GM home)
// arrive with the modules that feed them.
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Card } from '@/components/ui/card'
import { orpc } from '@/lib/api'
import { usePageTitle } from '@/lib/title'

export const Route = createFileRoute('/_app/')({
  component: Home,
})

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

function Home() {
  usePageTitle('Home')
  const organization = useQuery(orpc.organization.current.queryOptions())
  const properties = useQuery(orpc.properties.list.queryOptions({ input: { pageSize: 100 } }))

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-[-0.015em]">
          {organization.data?.organization.name ?? ' '}
        </h1>
        <span className="text-text-2">Your hotels</span>
      </div>

      {properties.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          {[0, 1].map((i) => (
            <Card key={i} className="h-[104px] animate-pulse bg-surface-2" />
          ))}
        </div>
      ) : properties.isError ? (
        <Card className="p-4 text-ro" role="alert">
          We couldn't load your hotels. Check your connection and refresh.
        </Card>
      ) : properties.data.items.length === 0 ? (
        <Card className="p-6 text-text-2">
          You're not on a hotel yet. An owner can give you access from Settings.
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {properties.data.items.map((property) => (
            <li key={property.id}>
              <Card className="flex min-w-0 flex-col gap-1 p-4">
                <span className="truncate text-md font-semibold">{property.name}</span>
                <span className="text-text-2">
                  {[property.area, property.state].filter(Boolean).join(', ') || 'Address not set'}
                </span>
                <span className="num flex flex-wrap gap-x-1.5 text-sm text-text-3">
                  <span className="whitespace-nowrap">
                    Business date {formatDate(property.businessDate)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="whitespace-nowrap">Check-in {property.checkInTime}</span>
                  <span aria-hidden="true">·</span>
                  <span className="whitespace-nowrap">Check-out {property.checkOutTime}</span>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
