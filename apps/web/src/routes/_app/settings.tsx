// Settings (design #25): a section list beside the page on desktop, tabs on phones. Only sections
// that are built are listed; the rest arrive with their bricks.
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { cn } from '@/lib/cn'
import { useMe } from '@/lib/me'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsLayout,
})

const SECTIONS = [
  { to: '/settings/members', label: 'Members and roles', needs: ['setup.manage'] },
  {
    to: '/settings/permissions',
    label: 'Permissions and limits',
    needs: ['setup.manage', 'permissions.manage'],
  },
] as const

function SettingsLayout() {
  const me = useMe()
  const sections = SECTIONS.filter((section) => section.needs.some((p) => me.can(p)))

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 lg:flex-row lg:gap-8">
      <nav aria-label="Settings" className="lg:w-52 lg:flex-none">
        <p className="mb-2 hidden px-2.5 text-xs font-semibold tracking-[0.05em] text-text-3 uppercase lg:block">
          Settings
        </p>
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
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
