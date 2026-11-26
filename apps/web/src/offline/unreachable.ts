// Whether a failed request never reached Vento (no connection, DNS, Wi-Fi without internet), as
// opposed to Vento answering with a problem. Browsers report that as a TypeError from fetch.
export function neverReached(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error && typeof error === 'object' && 'cause' in error) return neverReached(error.cause)
  return false
}
