// A calm message inside a card: an icon, one line, and the next step (empty, filtered, error).
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function Message({
  icon: Icon,
  title,
  alert,
  children,
}: {
  icon: LucideIcon
  title: string
  alert?: boolean
  children?: ReactNode
}) {
  return (
    <div
      role={alert ? 'alert' : undefined}
      className="flex flex-col items-center gap-3 px-6 py-12 text-center"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-text-2 ring-1 ring-border">
        <Icon className="size-5" aria-hidden="true" strokeWidth={1.7} />
      </span>
      <p className="max-w-sm text-[14px] text-text-2">{title}</p>
      {children}
    </div>
  )
}
