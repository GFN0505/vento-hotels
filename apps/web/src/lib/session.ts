// Every new sign-in starts without an active organization, so choose one for the person: their
// group if they belong to one (the first, until a group switcher exists). Returns undefined when
// they belong to none, which means an owner who still has to set up their group.
//
// When Vento can't be reached (power or internet cut), the person who was signed in on this device
// carries on from what was saved here, and pages say they're showing saved data (decision 0009).
import { markUnreachable } from '@/offline/connection'
import { rememberedSession, rememberSession } from '@/offline/saved-data'
import { neverReached } from '@/offline/unreachable'
import { authClient } from './auth'

function offlineFallback() {
  const saved = rememberedSession()
  if (!saved) return undefined
  markUnreachable()
  return saved
}

// Whether someone is signed in, for pages that only redirect signed-in people away (sign-in, get
// started). With no connection the answer is "not that we know", so the page itself still opens.
export async function hasSession(): Promise<boolean> {
  try {
    const { data } = await authClient.getSession()
    return Boolean(data)
  } catch (error) {
    if (neverReached(error)) return false
    throw error
  }
}

export async function loadSignedIn() {
  let result: Awaited<ReturnType<typeof authClient.getSession>>
  try {
    result = await authClient.getSession()
  } catch (error) {
    if (neverReached(error)) return offlineFallback()
    throw error
  }
  const { data, error } = result
  // Better Auth reports a request that never reached the API with no status.
  if (!data && error && !error.status) return offlineFallback()
  if (!data) return undefined
  const user = { id: data.user.id, name: data.user.name, email: data.user.email }
  if (data.session.activeOrganizationId) {
    rememberSession({ user, organizationId: data.session.activeOrganizationId })
    return { user: data.user, organizationId: data.session.activeOrganizationId }
  }
  const { data: organizations } = await authClient.organization.list()
  const first = organizations?.[0]
  if (!first) return { user: data.user, organizationId: undefined }
  await authClient.organization.setActive({ organizationId: first.id })
  rememberSession({ user, organizationId: first.id })
  return { user: data.user, organizationId: first.id }
}
