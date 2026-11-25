import { DEFAULT_TIME_ZONE } from '@vento/shared'

// Placeholder for the health endpoint; Hono and oRPC arrive in a later brick.
export type Health = { status: 'ok'; defaultTimeZone: string }

export function health(): Health {
  return { status: 'ok', defaultTimeZone: DEFAULT_TIME_ZONE }
}
