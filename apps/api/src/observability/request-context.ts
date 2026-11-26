// What we know about the request being handled, available anywhere below it without passing it
// around: its id, and the organization and property once access is checked.
import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestInfo = { requestId: string; organizationId?: string; propertyId?: string }

const storage = new AsyncLocalStorage<RequestInfo>()

export const currentRequest = (): RequestInfo | undefined => storage.getStore()

export function withRequest<T>(info: RequestInfo, run: () => T): T {
  return storage.run(info, run)
}

// Called once access is known, so later log lines and error reports name the organization.
export function noteOrganization(organizationId: string, propertyId?: string) {
  const info = storage.getStore()
  if (!info) return
  info.organizationId = organizationId
  if (propertyId) info.propertyId = propertyId
}
