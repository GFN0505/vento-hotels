import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { AuthCard } from '@/components/auth-card'
import { authClient } from '@/lib/auth'
import { usePageTitle } from '@/lib/title'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <Outlet />
      <Toaster position="bottom-right" closeButton />
    </>
  ),
  notFoundComponent: NotFound,
})

function NotFound() {
  usePageTitle('Page not found')
  const { data: session, isPending } = authClient.useSession()
  return (
    <AuthCard title="Page not found" subtitle="The link may be old, or the page has moved.">
      {isPending ? null : session ? (
        <Link to="/" className="inline-flex min-h-11 items-center text-pri-ink hover:underline">
          Go to home
        </Link>
      ) : (
        <Link
          to="/sign-in"
          className="inline-flex min-h-11 items-center text-pri-ink hover:underline"
        >
          Go to sign in
        </Link>
      )}
    </AuthCard>
  )
}
