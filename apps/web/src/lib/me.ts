// The signed-in member's group, role and permissions, from `organization.current`. Used to show
// only what someone can use; the API still checks every call (non-negotiable 3).
// While an owner previews the app as another role ("View as", lib/view-as.tsx), `role` and `can`
// answer for that role, from the group's permissions matrix; `real` keeps the true answers.
import { useQuery } from '@tanstack/react-query'
import type { Feature, MemberRole, Permission } from '@vento/shared'
import { orpc } from './api'
import { useViewAs } from './view-as'

export function useMe() {
  const query = useQuery(orpc.organization.current.queryOptions())
  const { viewAs } = useViewAs()
  const realPermissions = new Set<Permission>(query.data?.permissions ?? [])
  const canPreview =
    realPermissions.has('setup.manage') || realPermissions.has('permissions.manage')
  const previewing = canPreview && viewAs !== undefined && viewAs !== query.data?.member.role
  const matrix = useQuery({ ...orpc.permissions.list.queryOptions(), enabled: previewing })
  const previewPermissions = new Set<Permission>(
    (matrix.data?.items ?? [])
      .filter((rule) => rule.role === viewAs && rule.allowed)
      .map((rule) => rule.permission),
  )
  const permissions = previewing ? previewPermissions : realPermissions
  const features = new Set<Feature>(query.data?.features ?? [])
  const role: MemberRole | undefined = previewing ? viewAs : query.data?.member.role

  return {
    ...query,
    role,
    // The role being previewed, if any.
    previewing: previewing ? viewAs : undefined,
    can: (permission: Permission) => permissions.has(permission),
    // Whether a module is switched on for this group (decision 0021).
    has: (feature: Feature) => features.has(feature),
    real: {
      role: query.data?.member.role,
      can: (permission: Permission) => realPermissions.has(permission),
      canPreview,
    },
  }
}
