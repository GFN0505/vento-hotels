// Cash's tabs: My shift for people who run a shift, Shifts for them and for managers who read
// every shift. Links, not ARIA tabs: each is its own page with its own address.
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/cn'
import { useMe } from '@/lib/me'

export function useCashTabs() {
  const me = useMe()
  const runs = me.can('cashier_shift.operate')
  return [
    ...(runs ? [{ to: '/cash' as const, label: 'My shift' }] : []),
    ...(runs || me.can('leakage.view') ? [{ to: '/cash/shifts' as const, label: 'Shifts' }] : []),
  ]
}

export function CashTabs() {
  const tabs = useCashTabs()
  if (tabs.length < 2) return null
  return (
    <nav aria-label="Cash" className="-mt-1 mb-5 border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-none">
            <Link
              to={tab.to}
              activeOptions={{ exact: true, includeSearch: false }}
              className={cn(
                'flex h-11 items-center border-b-2 border-transparent px-3 font-medium whitespace-nowrap text-text-2 hover:text-text lg:h-10',
                'data-[status=active]:border-pri data-[status=active]:text-text',
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
