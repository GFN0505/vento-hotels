// Settings opens on its first section the person can use: Hotels for owners, group admins and GMs.
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useMe } from '@/lib/me'

export const Route = createFileRoute('/_app/settings/')({
  component: SettingsIndex,
})

function SettingsIndex() {
  const me = useMe()
  if (me.isPending) return null
  if (me.can('setup.manage') || me.can('property.operating_times')) {
    return <Navigate to="/settings/hotels" replace />
  }
  if (me.can('permissions.manage')) return <Navigate to="/settings/permissions" replace />
  if (me.has('front_desk')) {
    if (me.can('finance.setup')) return <Navigate to="/settings/taxes" replace />
    if (me.can('fx.enter')) return <Navigate to="/settings/fx-rates" replace />
    if (me.can('rates.edit')) return <Navigate to="/settings/taxes" replace />
  }
  return <Navigate to="/settings/members" replace />
}
