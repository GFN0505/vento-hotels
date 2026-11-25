// The "front door" screens (sign in, get started, forgot and reset password, setup): a navy brand
// panel taking half the page beside the form on desktop, and a slim navy band above the form on
// phones. Layout shared with Vento Real Estate; departures from the Hotels design export are
// logged in docs/design/CHANGES.md.
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
      <PhoneBand />
      <main className="flex flex-col px-6 pt-8 pb-10 lg:min-h-dvh lg:items-center lg:justify-center lg:p-12">
        {/* Front-door type is larger and calmer than inside the app: 14–15px text, darker labels,
            taller fields and button. Applied here so every auth screen gets it. */}
        <div className="flex w-full flex-col gap-5 text-md [&_button[type=submit]]:h-12 [&_button[type=submit]]:text-[15px] [&_input:not([type=checkbox])]:h-11 [&_input:not([type=checkbox])]:text-[15px] [&_label]:text-[13px] [&_label]:text-text lg:w-[400px]">
          <div className="mb-1">
            <h1 className="mb-2 text-[28px] leading-9 font-semibold tracking-[-0.02em]">{title}</h1>
            {subtitle ? <p className="text-[15px] leading-6 text-text-2">{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

// The brand headline, in the display serif with an italic accent. Shared by panel and phone band.
function Headline({ className, animated }: { className: string; animated: boolean }) {
  const line = (step: number) =>
    animated ? { className: 'auth-rise block', style: rise(step) } : { className: 'block' }
  return (
    <h2
      className={`font-display font-normal tracking-[-0.015em] [font-optical-sizing:auto] ${className}`}
    >
      <span {...line(1)}>Every room. Every naira.</span>
      <span {...line(2)}>
        Every night, <em className="text-logo-dot italic">accounted for.</em>
      </span>
    </h2>
  )
}

function PhoneBand() {
  return (
    <header className="auth-panel relative overflow-hidden px-6 pt-5 pb-7 text-white lg:hidden">
      <div className="auth-glow auth-glow-violet" aria-hidden="true" />
      <div className="auth-glow auth-glow-cyan" aria-hidden="true" />
      <Logo size={26} wordmark product className="relative text-[17px]" />
      <Headline className="relative mt-6 text-[26px] leading-[1.2]" animated={false} />
    </header>
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
        {/* Sized to the panel (half the window) so each line always fits on one line. */}
        <Headline
          className="mb-6 text-[clamp(26px,2.9vw,52px)] leading-[1.12] whitespace-nowrap"
          animated
        />
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
  return (
    <p className="text-center text-[13px] text-text-2 [&_a]:font-medium [&_a]:text-pri-ink [&_a:hover]:underline">
      {children}
    </p>
  )
}
