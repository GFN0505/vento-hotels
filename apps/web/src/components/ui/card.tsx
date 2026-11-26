// Card, matching `.card` in the designs: surface, subtle border, almost no shadow.
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('min-w-0 rounded-md border border-border bg-surface shadow-card', className)}
      {...props}
    />
  )
}
