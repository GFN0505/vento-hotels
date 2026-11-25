// When a request fails because Vento couldn't be reached (no connection, or the server had a
// problem), say so plainly. It's never the person's details, so don't send them re-checking fields.
export const CANT_REACH_VENTO =
  "Can't reach Vento right now. Your details are kept on this page. Try again in a moment."

export function isConnectionProblem(failure: { status?: number | undefined } | null | undefined) {
  if (!failure) return false
  const status = failure.status ?? 0
  return status === 0 || status >= 500
}
