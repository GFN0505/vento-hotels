// Navy sidebar from the designs (Shell components · Sidebar). Only screens that exist are listed;
// each module adds its entry here when it ships, under the design's groups (Front office, Revenue,
// Operations, Back office).
import { Link } from '@tanstack/react-router'
import { Home } from 'lucide-react'
import type { ComponentType } from 'react'
import { Logo } from '@/components/logo'
import { cn } from '@/lib/cn'

type NavItem = { to: '/'; label: string; icon: ComponentType<{ className?: string }> }

const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ to: '/', label: 'Home', icon: Home }] },
]

export function Sidebar({ groupName, onNavigate }: { groupName: string; onNavigate?: () => void }) {
  return (
    <nav
      aria-label="Main"
      className="flex h-full w-[232px] flex-none flex-col gap-0.5 bg-side px-2.5 py-3.5 text-side-text"
    >
      <div className="flex items-center gap-2.5 px-2 pt-1 pb-3.5 text-[15px] font-semibold text-white">
        <Logo size={28} />
        <span>Vento</span>
        <span className="ml-auto truncate text-xs font-medium text-side-mute">{groupName}</span>
      </div>
      {NAV.map((section) => (
        <div key={section.group ?? 'main'} className="flex flex-col gap-0.5">
          {section.group ? (
            <div className="px-2.5 pt-3.5 pb-1.5 text-xs font-semibold tracking-[0.05em] text-side-mute uppercase">
              {section.group}
            </div>
          ) : null}
          {section.items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              activeOptions={{ exact: true }}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-base font-medium text-side-text',
                'hover:bg-side-2 hover:text-white',
                'data-[status=active]:bg-brand/22 data-[status=active]:text-white',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
