import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { AuthCard } from '@/components/auth-card'
import { authClient } from '@/lib/auth'
import { usePageTitle } from '@/lib/title'
import { reportError } from '@/observability/errors'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <Outlet />
      <Toaster position="bottom-right" closeButton />
    </>
  ),
  notFoundComponent: NotFound,
  errorComponent: Failed,
})

// Anything unexpected: say it plainly and offer the one thing that usually fixes it. Most often it's
// the connection, so say that first.
function Failed({ error }: { error: unknown }) {
  usePageTitle('Something went wrong')
  useEffect(() => reportError(error), [error])
  return (
    <AuthCard
      title="Something went wrong"
      subtitle={
        navigator.onLine
          ? "Vento couldn't open this page. Try again; if it keeps happening, tell your manager."
          : "You're offline, and this page needs a connection. Try again when you're back online."
      }
    >
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex min-h-11 items-center text-pri-ink hover:underline"
      >
        Try again
      </button>
    </AuthCard>
  )
}

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
