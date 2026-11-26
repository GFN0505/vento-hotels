// A titled card for the plan editor's sections (design #33: Price, What's included and rules…).
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export function EditorCard({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="@container">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside ? <span className="text-sm text-text-3">{aside}</span> : null}
      </div>
      <div className="flex flex-col gap-4 p-4 sm:p-5">{children}</div>
    </Card>
  )
}
