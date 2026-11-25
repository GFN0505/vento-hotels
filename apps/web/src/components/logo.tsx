// The Vento mark (V with a dot) from the approved designs, with optional wordmark. Colours come from
// the --logo-v and --logo-dot tokens; proportions are fixed so it never looks different anywhere.
import { cn } from '@/lib/cn'

type LogoProps = { size?: number; wordmark?: boolean; className?: string }

export function Logo({ size = 28, wordmark = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label="Vento"
        className="block flex-none"
      >
        <path
          d="M24 22 L50 78 L76 22"
          fill="none"
          className="stroke-logo-v"
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="27" r="9" className="fill-logo-dot" />
      </svg>
      {wordmark ? <span className="font-semibold">Vento</span> : null}
    </span>
  )
}
