// When a request fails because Vento couldn't be reached (no connection, or the server had a
// problem), say so plainly. It's never the person's details, so don't send them re-checking fields.
export const CANT_REACH_VENTO =
  "Can't reach Vento right now. Your details are kept on this page. Try again in a moment."

export function isConnectionProblem(failure: { status?: number | undefined } | null | undefined) {
  if (!failure) return false
  const status = failure.status ?? 0
  return status === 0 || status >= 500
}

// The message to show for a failed API call: the API's own words for problems with the request
// (they're written for people), and the connection message for everything else.
export function problemMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const { status, message } = error as { status: unknown; message: unknown }
    if (
      typeof status === 'number' &&
      status >= 400 &&
      status < 500 &&
      typeof message === 'string'
    ) {
      return message
    }
  }
  return CANT_REACH_VENTO
}

// The `data` an API error carries for the web app to react to (e.g. `{ code: 'STALE_VERSION' }`).
export function errorData(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data: unknown }).data
    if (data && typeof data === 'object') return data as Record<string, unknown>
  }
  return {}
}

export function errorCode(error: unknown): string | undefined {
  const code = errorData(error).code
  return typeof code === 'string' ? code : undefined
}

// Like problemMessage, but also trusts the API's words for a known problem it answers with a 5xx
// status (uploads not set up on this server: STORAGE_OFF).
export function apiMessage(error: unknown, trusted: readonly string[] = []): string {
  const code = errorCode(error)
  if (code && trusted.includes(code) && error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return problemMessage(error)
}
