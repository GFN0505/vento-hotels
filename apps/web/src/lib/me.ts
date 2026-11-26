// The signed-in member's group, role and permissions, from `organization.current`. Used to show
// only what someone can use; the API still checks every call (non-negotiable 3).

import { useQuery } from '@tanstack/react-query'
import type { Feature, Permission } from '@vento/shared'
import { orpc } from './api'

export function useMe() {
  const query = useQuery(orpc.organization.current.queryOptions())
  const permissions = new Set<Permission>(query.data?.permissions ?? [])
  const features = new Set<Feature>(query.data?.features ?? [])
  return {
    ...query,
    can: (permission: Permission) => permissions.has(permission),
    // Whether a module is switched on for this group (decision 0021).
    has: (feature: Feature) => features.has(feature),
  }
}
