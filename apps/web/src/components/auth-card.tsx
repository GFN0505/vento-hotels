// The centred card used by sign-in, get-started and setup (design: 24 · Sign in).
import type { ReactNode } from 'react'
import { Logo } from '@/components/logo'
import { Card } from '@/components/ui/card'

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Card className="flex w-full max-w-[420px] flex-col gap-[18px] p-7">
        <span className="text-[20px] font-semibold leading-6">
          <Logo size={32} wordmark />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-[-0.015em]">{title}</h1>
          {subtitle ? <span className="text-text-2">{subtitle}</span> : null}
        </div>
        {children}
      </Card>
      <p className="text-sm text-text-3">vento.ng · Help · Privacy (NDPA 2023)</p>
    </main>
  )
}
