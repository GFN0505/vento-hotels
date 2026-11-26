// Navy sidebar from the designs (Shell components · Sidebar): Home, the modules grouped as Front
// office, Revenue, Operations and Back office, and Settings at the foot. Each person sees the
// modules switched on for their group (decision 0021) that their role uses (lib/navigation.ts).
import { Link } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react'
import { Logo } from '@/components/logo'
import { cn } from '@/lib/cn'
import { HOME_ENTRY, type NavGroup } from '@/lib/navigation'

type SidebarProps = {
  groupName: string
  groups: NavGroup[]
  // Settings shows only for people who can use it; the API checks anyway.
  showSettings: boolean
  onNavigate?: () => void
}

const itemClass = cn(
  'flex h-11 flex-none items-center gap-3 rounded-sm px-3 text-[14px] font-medium text-side-text lg:h-10 [@media(max-height:820px)]:lg:h-8',
  'hover:bg-side-2 hover:text-white',
  'data-[status=active]:bg-brand/22 data-[status=active]:text-white',
)

function Item({
  to,
  label,
  icon: Icon,
  exact,
  onNavigate,
}: {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  exact?: boolean
  onNavigate: (() => void) | undefined
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      activeOptions={{ exact: exact ?? false }}
      className={itemClass}
    >
      <Icon className="size-[18px] flex-none" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

export function Sidebar({ groupName, groups, showSettings, onNavigate }: SidebarProps) {
  // The fade at the bottom shows only while there's more menu to scroll to.
  const scroller = useRef<HTMLDivElement>(null)
  const [moreBelow, setMoreBelow] = useState(false)
  const update = useCallback(() => {
    const el = scroller.current
    if (el) setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }, [])
  useEffect(() => {
    update()
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [update])
  return (
    <nav
      aria-label="Main"
      className="flex h-full w-[280px] flex-none flex-col bg-side px-3 py-4 text-side-text lg:w-[248px] xl:w-[280px]"
    >
      <div className="flex flex-col gap-1 px-2 pt-1 pb-4">
        <Logo size={28} wordmark product className="text-[16px] text-white" />
        <span className="truncate pl-[38px] text-sm font-medium text-side-mute" title={groupName}>
          {groupName}
        </span>
      </div>
      {/* A soft fade at the bottom says there's more to scroll on short screens. */}
      <div className="relative flex min-h-0 grow flex-col">
        <div
          ref={scroller}
          onScroll={update}
          className="flex min-h-0 grow flex-col gap-0.5 overflow-y-auto pb-2"
        >
          <Item {...HOME_ENTRY} exact onNavigate={onNavigate} />
          {groups.map((group) => (
            <div key={group.label ?? 'main'} className="flex flex-col gap-0.5">
              {group.label ? (
                <div className="px-3 pt-4 pb-1.5 text-xs font-semibold tracking-[0.05em] text-side-mute uppercase [@media(max-height:820px)]:pt-2.5 [@media(max-height:820px)]:pb-1">
                  {group.label}
                </div>
              ) : null}
              {group.entries.map((entry) => (
                <Item key={entry.to} {...entry} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
        </div>
        {moreBelow ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-side to-transparent"
          />
        ) : null}
      </div>
      {showSettings ? (
        <div className="mt-2 border-t border-side-2 pt-2">
          <Item to="/settings" label="Settings" icon={Settings} onNavigate={onNavigate} />
        </div>
      ) : null}
    </nav>
  )
}
