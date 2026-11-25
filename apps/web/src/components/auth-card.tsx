// The "front door" screens (sign in, get started, forgot and reset password, setup): a navy brand
// panel taking half the page beside the form on desktop, the form alone under a small logo on phones. Same layout as
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
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-2">
      <BrandPanel />
      <main className="flex min-h-dvh flex-col gap-5 px-6 pt-4 pb-8 lg:items-center lg:p-12 lg:pt-[14vh]">
        <div className="flex min-h-10 items-center lg:hidden">
          <Logo size={26} wordmark product className="text-lg" />
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

// Each piece of copy rises in a beat after the one before.
const rise = (step: number) => ({ animationDelay: `${0.35 + step * 0.12}s` })

function BrandPanel() {
  return (
    <aside className="auth-panel relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex xl:p-16">
      {/* Light that drifts slowly behind everything, and a faint dot grid for depth. */}
      <div className="auth-glow auth-glow-violet" aria-hidden="true" />
      <div className="auth-glow auth-glow-cyan" aria-hidden="true" />
      <div className="auth-glow auth-glow-indigo" aria-hidden="true" />
      <div className="auth-grid" aria-hidden="true" />

      {/* A large, faint mark in the corner that draws itself when the page opens. */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="auth-draw pointer-events-none absolute -right-48 -bottom-56 size-[560px] opacity-[0.07]"
      >
        <path
          d="M24 22 L50 78 L76 22"
          fill="none"
          stroke="currentColor"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="27" r="9" fill="currentColor" />
      </svg>

      <Logo size={30} wordmark product className="auth-rise relative text-[18px]" />

      <div className="relative">
        <p
          className="auth-rise mb-5 text-xs font-semibold tracking-[0.14em] text-logo-dot uppercase"
          style={rise(0)}
        >
          For hotel groups in Nigeria
        </p>
        <h2 className="mb-6 text-[34px] leading-[1.15] font-semibold tracking-[-0.025em] xl:text-[44px]">
          <span className="auth-rise block" style={rise(1)}>
            Every room. Every naira.
          </span>
          <span className="auth-rise block" style={rise(2)}>
            Every night, <span className="text-logo-dot">accounted for.</span>
          </span>
        </h2>
        <p className="auth-rise max-w-[460px] text-lg leading-7 text-side-text" style={rise(3)}>
          Run every hotel in your group from one place, and know exactly how each one is doing.
        </p>
      </div>

      <div
        className="auth-rise relative flex flex-wrap gap-4 text-sm text-side-mute"
        style={rise(4)}
      >
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
