// Signed-in layout: sidebar + top bar. Sends people without a session to sign in (or, on a
// registered shared device, to its lock screen), and owners who haven't set up their group to setup.
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { PropertyProvider } from '@/components/shell/property-context'
import { Sidebar } from '@/components/shell/sidebar'
import { TopBar } from '@/components/shell/top-bar'
import { orpc } from '@/lib/api'
import { useIdleLock } from '@/lib/device-session'
import { useMe } from '@/lib/me'
import { loadSignedIn } from '@/lib/session'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const signedIn = await loadSignedIn()
    if (!signedIn) {
      // Loaded only here, so the API client isn't part of the first download for signed-out visitors.
      const { api } = await import('@/lib/api')
      const lock = await api.devices.lockScreen().catch(() => undefined)
      throw redirect({ to: lock && lock.status !== 'unregistered' ? '/lock' : '/sign-in' })
    }
    if (!signedIn.organizationId) throw redirect({ to: '/setup' })
    return { user: signedIn.user }
  },
  component: AppLayout,
})

function AppLayout() {
  const { user } = Route.useRouteContext()
  const [menuOpen, setMenuOpen] = useState(false)
  const organization = useMe()
  const showSettings = organization.can('setup.manage') || organization.can('permissions.manage')
  const properties = useQuery(orpc.properties.list.queryOptions({ input: { pageSize: 100 } }))
  useIdleLock(organization.data?.device?.idleSeconds, user.name.split(' ')[0] ?? user.name)

  return (
    <PropertyProvider properties={properties.data?.items ?? []}>
      <div className="flex min-h-dvh">
        <div className="sticky top-0 hidden h-dvh lg:block">
          <Sidebar
            groupName={organization.data?.organization.name ?? ''}
            showSettings={showSettings}
          />
        </div>
        {menuOpen ? (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <Sidebar
              groupName={organization.data?.organization.name ?? ''}
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
          <TopBar user={user} onOpenMenu={() => setMenuOpen(true)} />
          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </PropertyProvider>
  )
}
