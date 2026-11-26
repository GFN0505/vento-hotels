// The few things this role starts most often (design: GMHome "New reservation · Walk-in"), shown
// in the banner. Only actions whose module the person uses and the group has switched on.
import { Link } from '@tanstack/react-router'
import type { MemberRole } from '@vento/shared'
import type { ReactNode } from 'react'
import { useMe } from '@/lib/me'
import { findModule, roleSees } from '@/lib/navigation'
import type { QuickAction } from './role-focus'

export function QuickActions({
  actions,
  role,
  children,
}: {
  actions: QuickAction[]
  role: MemberRole
  // Anything else for the row, e.g. the way back to the whole group.
  children?: ReactNode
}) {
  const me = useMe()
  const usable = actions.filter((action) => {
    const module = findModule(action.to)
    return module ? me.has(module.feature) && roleSees(role, module) : false
  })
  if (usable.length === 0 && !children) return null
  return (
    <div className="flex flex-wrap gap-2">
      {usable.map((action, index) => {
        const Icon = action.icon
        return (
          <Link
            key={action.label}
            to="/$section"
            params={{ section: action.to.slice(1) }}
            className={
              index === 0
                ? 'inline-flex h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-side shadow-sm transition hover:bg-white/90 lg:h-10'
                : 'inline-flex h-11 items-center gap-2 rounded-md border border-white/20 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20 lg:h-10'
            }
          >
            <Icon className="size-4" aria-hidden="true" strokeWidth={1.9} />
            {action.label}
          </Link>
        )
      })}
      {children}
    </div>
  )
}
