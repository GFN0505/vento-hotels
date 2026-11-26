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
