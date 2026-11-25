import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { AuthCard } from '@/components/auth-card'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <Outlet />
      <Toaster position="bottom-right" richColors closeButton />
    </>
  ),
  notFoundComponent: () => (
    <AuthCard title="Page not found" subtitle="The link may be old, or the page has moved.">
      <Link to="/" className="text-pri-ink hover:underline">
        Go to home
      </Link>
    </AuthCard>
  ),
})
