// Signed-in layout: sidebar + top bar. Sends people without a session to sign in (or, on a
// registered shared device, to its lock screen), and owners who haven't set up their group to setup.
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { HotelChange } from '@/components/shell/hotel-change'
import { useHotelGoneRefresh, useHotelLink } from '@/components/shell/hotel-link'
import { OfflineBanner } from '@/components/shell/offline-banner'
import { PreviewBanner } from '@/components/shell/preview-banner'
import { PropertyProvider } from '@/components/shell/property-context'
import { useTitleOnNavigate } from '@/components/shell/route-title'
import { Sidebar } from '@/components/shell/sidebar'
import { TopBar } from '@/components/shell/top-bar'
import { orpc } from '@/lib/api'
import { useIdleLock } from '@/lib/device-session'
import { useMe } from '@/lib/me'
import { spansGroup, visibleGroups } from '@/lib/navigation'
import { loadSignedIn } from '@/lib/session'
import { ViewAsProvider } from '@/lib/view-as'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    const signedIn = await loadSignedIn()
    if (!signedIn) {
      // Loaded only here, so the API client isn't part of the first download for signed-out visitors.
      const { api } = await import('@/lib/api')
      const lock = await api.devices.lockScreen().catch(() => undefined)
      if (lock && lock.status !== 'unregistered') throw redirect({ to: '/lock' })
      // Back to where they were going after signing in.
      const here = location.href === '/' ? undefined : location.href
      throw redirect({ to: '/sign-in', search: here ? { redirect: here } : {} })
    }
    if (!signedIn.organizationId) throw redirect({ to: '/setup' })
    return { user: signedIn.user }
  },
  // ?hotel=<id|all> on any page selects that hotel (components/shell/hotel-link.tsx), then leaves
  // the address bar. Declared here so every page's links may carry it.
  validateSearch: (search: Record<string, unknown>): { hotel?: string | undefined } =>
    typeof search.hotel === 'string' && search.hotel ? { hotel: search.hotel.slice(0, 40) } : {},
  component: AppLayout,
})

function AppLayout() {
  return (
    <ViewAsProvider>
      <Shell />
    </ViewAsProvider>
  )
}

function Shell() {
  const { user } = Route.useRouteContext()
  const [menuOpen, setMenuOpen] = useState(false)
  const organization = useMe()
  const showSettings =
    organization.can('setup.manage') ||
    organization.can('permissions.manage') ||
    organization.can('property.operating_times') ||
    // Taxes, payments and FX rates ship behind front desk (decision 0021).
    (organization.has('front_desk') &&
      (organization.can('finance.setup') ||
        organization.can('fx.enter') ||
        organization.can('rates.edit')))
  const groups = organization.role
    ? visibleGroups(organization.role, organization.has, organization.can)
    : []
  const properties = useQuery(orpc.properties.list.queryOptions({ input: { pageSize: 100 } }))
  const loaded = (query: { data?: unknown; isError: boolean }) =>
    query.data !== undefined || query.isError
  useIdleLock(organization.data?.device?.idleSeconds, user.name.split(' ')[0] ?? user.name)

  return (
    <PropertyProvider
      properties={properties.data?.items ?? []}
      ready={loaded(properties) && loaded(organization)}
      previewing={organization.previewing !== undefined}
      // A shared device works in its own hotel, so it never offers the whole group; nor does a
      // preview of a role that works in one hotel.
      groupWide={Boolean(
        organization.data?.member.allProperties &&
          !organization.data.device &&
          organization.role &&
          spansGroup(organization.role),
      )}
    >
      {/* First tab stop: keyboard users skip the menu in one key press. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-4 focus:py-2 focus:font-medium focus:text-pri-ink focus:shadow-[var(--shadow-lg)]"
      >
        Skip to main content
      </a>
      <div className="flex min-h-dvh">
        <div className="sticky top-0 hidden h-dvh lg:block">
          <Sidebar
            groupName={organization.data?.organization.name ?? ''}
            groups={groups}
            showSettings={showSettings}
          />
        </div>
        {menuOpen ? (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <Sidebar
              groupName={organization.data?.organization.name ?? ''}
              groups={groups}
              showSettings={showSettings}
              onNavigate={() => setMenuOpen(false)}
            />
            <button
              type="button"
              aria-label="Close menu"
              className="grow bg-[var(--overlay)]"
              onClick={() => setMenuOpen(false)}
            />
          </div>
        ) : null}
        <div className="flex min-w-0 grow flex-col">
          <PreviewBanner />
          <TopBar user={user} onOpenMenu={() => setMenuOpen(true)} />
          <OfflineBanner />
          <main
            id="main"
            tabIndex={-1}
            className="flex-1 px-4 pt-5 pb-14 outline-none sm:px-6 lg:px-8 lg:pt-7"
          >
            <Page />
          </main>
        </div>
      </div>
    </PropertyProvider>
  )
}

// The page, once any ?hotel= link has chosen its hotel, so its first request is for that hotel.
function Page() {
  const linking = useHotelLink()
  useHotelGoneRefresh()
  useTitleOnNavigate()
  return (
    <>
      <HotelChange />
      {linking ? (
        <div role="status" aria-label="Opening the hotel" className="flex flex-col gap-4">
          <span className="h-5 w-32 animate-pulse rounded-sm bg-surface-2" />
          <span className="h-7 w-56 animate-pulse rounded-sm bg-surface-2" />
          <span className="h-48 animate-pulse rounded-lg bg-surface-2" />
        </div>
      ) : (
        <Outlet />
      )}
    </>
  )
}
