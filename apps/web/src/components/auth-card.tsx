// The "front door" screens (sign in, get started, forgot and reset password, setup): a navy brand
// panel beside the form on desktop, the form alone under a small logo on phones. Same layout as
// Vento Real Estate's sign-in, so the two products feel like one family (logged in
// docs/design/CHANGES.md, since the Hotels design export shows a centred card).
import { Building2, ShieldCheck, Zap } from 'lucide-react'
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

const PROOF = [
  {
    icon: ShieldCheck,
    text: 'Leakage caught, not guessed: every discount, void and unrecorded room, by name.',
  },
  { icon: Zap, text: 'Keeps working when the power or the internet doesn’t.' },
  { icon: Building2, text: 'One view across every hotel in your group.' },
]

function BrandPanel() {
  return (
    <aside className="auth-panel relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
      {/* A large, faint mark in the corner: texture, not decoration that competes with the copy. */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -bottom-48 size-[440px] opacity-[0.05]"
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

      <Logo size={30} wordmark product className="relative text-[18px]" />

      <div className="relative">
        <p className="mb-5 text-xs font-semibold tracking-[0.14em] text-logo-dot uppercase">
          For hotel groups in Nigeria
        </p>
        <h2 className="mb-5 text-[30px] leading-[1.2] font-semibold tracking-[-0.025em]">
          Every room. Every naira.
          <br />
          Every night, <span className="text-logo-dot">accounted for.</span>
        </h2>
        <p className="mb-8 max-w-[400px] text-md leading-6 text-side-text">
          Front desk, restaurant, housekeeping and night audit in one calm place, with the owner’s
          report on WhatsApp before breakfast.
        </p>
        <ul className="flex max-w-[400px] flex-col gap-3.5">
          {PROOF.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-base text-side-text">
              <span className="grid size-7 flex-none place-items-center rounded-sm border border-white/10 bg-white/5">
                <Icon className="size-4 text-white" />
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative flex flex-wrap gap-4 text-sm text-side-mute">
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
