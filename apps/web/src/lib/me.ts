// The signed-in member's group, role and permissions, from `organization.current`. Used to show
// only what someone can use; the API still checks every call (non-negotiable 3).

import { useQuery } from '@tanstack/react-query'
import type { Permission } from '@vento/shared'
import { orpc } from './api'

export function useMe() {
  const query = useQuery(orpc.organization.current.queryOptions())
  const permissions = new Set<Permission>(query.data?.permissions ?? [])
  return {
    ...query,
    can: (permission: Permission) => permissions.has(permission),
  }
}
