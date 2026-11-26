// Settings (design #25): a section list beside the page on desktop, tabs on phones. Only sections
// that are built are listed; the rest arrive with their bricks.
import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { useMe } from '@/lib/me'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsLayout,
})

const SECTIONS = [
  {
    to: '/settings/hotels',
    label: 'Hotels',
    needs: ['setup.manage', 'property.operating_times'],
  },
  { to: '/settings/companies', label: 'Companies', needs: ['setup.manage'] },
  { to: '/settings/members', label: 'Members and roles', needs: ['setup.manage'] },
  { to: '/settings/devices', label: 'Devices', needs: ['setup.manage'] },
  {
    to: '/settings/permissions',
    label: 'Permissions and limits',
    needs: ['setup.manage', 'permissions.manage'],
  },
] as const

function SettingsLayout() {
  const me = useMe()
  const sections = SECTIONS.filter((section) => section.needs.some((p) => me.can(p)))
  const list = useRef<HTMLUListElement>(null)
  const { pathname } = useLocation()
  // On phones the sections scroll sideways: keep the open one in view.
  useEffect(() => {
    if (!pathname.startsWith('/settings')) return
    list.current
      ?.querySelector<HTMLElement>('[data-status="active"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:gap-10">
      <nav aria-label="Settings" className="lg:w-52 lg:flex-none">
        <p className="mb-2 hidden px-2.5 text-xs font-semibold tracking-[0.05em] text-text-3 uppercase lg:block">
          Settings
        </p>
        {/* Phones: no scrollbar, and the right edge fades to say there's more. */}
        <ul
          ref={list}
          className="-mx-4 flex gap-1 overflow-x-auto pr-10 pl-4 [scrollbar-width:none] max-lg:[mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)] lg:mx-0 lg:flex-col lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {sections.map((section) => (
            <li key={section.to} className="flex-none">
              <Link
                to={section.to}
                className={cn(
                  'flex h-11 items-center rounded-sm px-3 font-medium whitespace-nowrap text-text-2 hover:bg-surface-2 hover:text-text lg:h-8 lg:px-2.5',
                  'data-[status=active]:bg-pri-soft data-[status=active]:text-pri-ink',
                )}
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 grow">
        <Outlet />
      </div>
    </div>
  )
}
