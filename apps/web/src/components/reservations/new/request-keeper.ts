// The booking request in flight. A retry after a dropped connection must send exactly the request
// that may already have been booked (same key, same body): rebuilding it from the current quote
// could differ and be refused as a different booking. Cleared once the server has answered.
export function createRequestKeeper<T>() {
  let current: T | undefined
  return {
    // The request in flight, or a new one built now.
    take(build: () => T): T {
      if (current === undefined) current = build()
      return current
    },
    clear() {
      current = undefined
    },
  }
}
