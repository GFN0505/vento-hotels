// Home's welcome (as in Vento Real Estate): navy with the brand's slow light, a faint dot grid and
// the V drawing itself in the corner, the same craft as the sign-in panel. Calm by design: it all
// stays still for people who ask for reduced motion.
import type { ReactNode } from 'react'

type WelcomeBannerProps = { date: string; title: ReactNode; subtitle: ReactNode; aside?: ReactNode }

export function WelcomeBanner({ date, title, subtitle, aside }: WelcomeBannerProps) {
  return (
    <section className="auth-panel relative overflow-hidden rounded-2xl px-6 py-8 text-white sm:px-10 sm:py-11">
      <div className="auth-glow auth-glow-violet" aria-hidden="true" />
      <div className="auth-glow auth-glow-cyan" aria-hidden="true" />
      <div className="auth-grid" aria-hidden="true" />
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="auth-draw pointer-events-none absolute -right-10 -bottom-28 size-[340px] text-white opacity-[0.08] sm:right-8 sm:size-[380px]"
      >
        <path
          d="M24 22 L50 78 L76 22"
          fill="none"
          stroke="currentColor"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="27" r="9" className="text-logo-dot" fill="currentColor" />
      </svg>
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="auth-rise text-sm font-medium text-side-text">{date}</p>
          <h1
            tabIndex={-1}
            className="auth-rise text-[clamp(28px,4.2vw,46px)] leading-[1.08] font-semibold tracking-[-0.025em] focus:outline-none"
            style={{ animationDelay: '80ms' }}
          >
            {title}
          </h1>
          <p className="auth-rise text-md text-side-text" style={{ animationDelay: '160ms' }}>
            {subtitle}
          </p>
        </div>
        {aside ? (
          <div className="auth-rise relative" style={{ animationDelay: '240ms' }}>
            {aside}
          </div>
        ) : null}
      </div>
    </section>
  )
}
