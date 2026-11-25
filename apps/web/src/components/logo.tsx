// The Vento mark (V with a dot) from the approved designs, with the optional "Vento | Hotels"
// lockup that tells this product apart from the other Vento products (e.g. Vento Real Estate).
// Colours come from the --logo-v and --logo-dot tokens; proportions are fixed.
import { cn } from '@/lib/cn'

export const PRODUCT_NAME = 'Vento Hotels'

type LogoProps = {
  size?: number
  wordmark?: boolean
  // Shows the product after the wordmark: "Vento | Hotels". Use wherever the product is introduced.
  product?: boolean
  className?: string
}

export function Logo({ size = 28, wordmark = false, product = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label={product ? PRODUCT_NAME : 'Vento'}
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
      {wordmark ? (
        <span className="inline-flex items-center gap-2.5 font-semibold" aria-hidden={product}>
          Vento
          {product ? (
            <>
              <span className="h-[1em] w-px bg-current opacity-30" />
              <span className="font-medium tracking-[0.02em] opacity-80">Hotels</span>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  )
}
