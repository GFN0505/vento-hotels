// Error tracking for the web app (Sentry), off unless VITE_SENTRY_DSN is set at build time. Loaded
// after the page, so it never adds to the first download; errors before then are held and sent once
// it's ready. Nothing personal is sent: no user, no form data, no URLs' query strings.
type Reporter = (error: unknown) => void

const held: unknown[] = []
let report: Reporter = (error) => {
  if (held.length < 20) held.push(error)
}

export function reportError(error: unknown) {
  report(error)
}

export function startErrorTracking() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) {
    report = () => {}
    held.length = 0
    return
  }
  window.addEventListener('error', (event) => reportError(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason))
  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
      beforeSend(event) {
        delete event.user
        const url = event.request?.url
        if (event.request && url) event.request.url = url.split('?')[0] ?? url
        return event
      },
    })
    report = (error) => Sentry.captureException(error)
    for (const error of held.splice(0)) report(error)
  })
}
