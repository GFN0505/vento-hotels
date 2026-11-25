// Every new sign-in starts without an active organization, so choose one for the person: their
// group if they belong to one (the first, until a group switcher exists). Returns undefined when
// they belong to none, which means an owner who still has to set up their group.
import { authClient } from './auth'

export async function loadSignedIn() {
  const { data } = await authClient.getSession()
  if (!data) return undefined
  if (data.session.activeOrganizationId) {
    return { user: data.user, organizationId: data.session.activeOrganizationId }
  }
  const { data: organizations } = await authClient.organization.list()
  const first = organizations?.[0]
  if (!first) return { user: data.user, organizationId: undefined }
  await authClient.organization.setActive({ organizationId: first.id })
  return { user: data.user, organizationId: first.id }
}
