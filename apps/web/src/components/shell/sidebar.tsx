// Navy sidebar from the designs (Shell components · Sidebar). Only screens that exist are listed;
// each module adds its entry here when it ships, under the design's groups (Front office, Revenue,
// Operations, Back office).
import { Link } from '@tanstack/react-router'
import { Home, Settings } from 'lucide-react'
import type { ComponentType } from 'react'
import { Logo } from '@/components/logo'
import { cn } from '@/lib/cn'

type NavItem = {
  to: '/' | '/settings'
  label: string
  icon: ComponentType<{ className?: string }>
  // Exact match for Home; Settings stays highlighted on its sub-pages.
  exact: boolean
}

const HOME: NavItem = { to: '/', label: 'Home', icon: Home, exact: true }
const SETTINGS: NavItem = { to: '/settings', label: 'Settings', icon: Settings, exact: false }

type SidebarProps = {
  groupName: string
  // Settings shows only for people who can use it; the API checks anyway.
  showSettings: boolean
  onNavigate?: () => void
}

export function Sidebar({ groupName, showSettings, onNavigate }: SidebarProps) {
  const nav: { group?: string; items: NavItem[] }[] = [
    { items: [HOME] },
    ...(showSettings ? [{ group: 'Admin', items: [SETTINGS] }] : []),
  ]
  return (
    <nav
      aria-label="Main"
      className="flex h-full w-[232px] flex-none flex-col gap-0.5 bg-side px-2.5 py-3.5 text-side-text"
    >
      <div className="flex flex-col gap-1 px-2 pt-1 pb-3.5">
        <Logo size={26} wordmark product className="text-[15px] text-white" />
        <span className="truncate pl-[36px] text-xs font-medium text-side-mute">{groupName}</span>
      </div>
      {nav.map((section) => (
        <div key={section.group ?? 'main'} className="flex flex-col gap-0.5">
          {section.group ? (
            <div className="px-2.5 pt-3.5 pb-1.5 text-xs font-semibold tracking-[0.05em] text-side-mute uppercase">
              {section.group}
            </div>
          ) : null}
          {section.items.map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              activeOptions={{ exact }}
              className={cn(
                'flex h-11 items-center lg:h-8 gap-2.5 rounded-sm px-2.5 text-base font-medium text-side-text',
                'hover:bg-side-2 hover:text-white',
                'data-[status=active]:bg-brand/22 data-[status=active]:text-white',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
