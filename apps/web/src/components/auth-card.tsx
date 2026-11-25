// The "front door" screens (sign in, get started, forgot and reset password, setup): a navy brand
// panel beside the form on desktop, the form alone under a small logo on phones. Same layout as
// Vento Real Estate's sign-in, so the two products feel like one family (logged in
// docs/design/CHANGES.md, since the Hotels design export shows a centred card).
import type { ReactNode } from 'react'
import { Logo } from '@/components/logo'

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
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[520px_1fr]">
      <BrandPanel />
      <main className="flex min-h-dvh flex-col gap-5 px-6 pt-4 pb-8 lg:items-center lg:p-12 lg:pt-[14vh]">
        <div className="flex min-h-10 items-center lg:hidden">
          <Logo size={26} wordmark className="text-lg" />
        </div>
        {/* Larger fields and main button than inside the app: easier to tap, as on Real Estate. */}
        <div className="flex w-full flex-col gap-[18px] lg:w-[400px] [&_button[type=submit]]:h-12 [&_button[type=submit]]:text-[15px] [&_input:not([type=checkbox])]:h-11">
          <div>
            <h1 className="mb-1.5 text-[24px] leading-8 font-semibold tracking-[-0.015em]">
              {title}
            </h1>
            {subtitle ? <p className="text-text-2">{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

function BrandPanel() {
  return (
    <aside className="hidden flex-col justify-between bg-side p-12 text-white lg:flex">
      <Logo size={30} wordmark className="text-[18px]" />
      <div>
        <p className="mb-3 max-w-[380px] text-[28px] leading-[1.3] font-semibold tracking-[-0.02em]">
          Rooms, restaurant, housekeeping and money in one place.
        </p>
        <p className="max-w-[380px] text-md text-side-text">
          Built for Nigerian hotel groups: front desk, POS, night audit and the owner's morning
          report.
        </p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-side-mute">
        <span>© 2026 Vento</span>
        <span>Privacy (NDPA 2023)</span>
        <span>Terms</span>
      </div>
    </aside>
  )
}

// Small print under the main button: links to the neighbouring screens.
export function AuthFootnote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-2 [&_a]:text-pri-ink [&_a:hover]:underline">{children}</p>
}
