import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startErrorTracking } from './observability/errors'
import { markReachable, markUnreachable } from './offline/connection'
import { keepSaving, restore } from './offline/saved-data'
import { neverReached } from './offline/unreachable'
import { routeTree } from './routeTree.gen'
import './styles.css'

const queryClient = new QueryClient({
  // Every answer from Vento proves it can be reached; a request that never got there proves not.
  queryCache: new QueryCache({
    onSuccess: markReachable,
    onError: (error) => (neverReached(error) ? markUnreachable() : markReachable()),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Show the copy kept on this device while there's no connection, instead of waiting.
      networkMode: 'offlineFirst',
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

window.addEventListener('load', () => {
  startErrorTracking()
  if (import.meta.env.PROD) {
    void import('./offline/register').then(({ registerServiceWorker }) => registerServiceWorker())
  }
})

// The data last seen goes into the cache before the first render, so pages open offline. Not a
// top-level await: that makes the bundler load every route up front.
void restore(queryClient).finally(() => {
  keepSaving(queryClient)
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
})
