// The 30-day line on each currency card. A small inline SVG rather than Recharts: the page stays
// inside the speed budget (bundle-budget.json), and a sparkline needs no axes or tooltips. The
// rates are scaled for drawing only; no money is calculated here.
import type { FxCurrency } from '@vento/shared'
import { dateLabel } from '@/components/hotels/format'

type Point = { rateDate: string; rate: string }

const W = 240
const H = 48

export function FxTrend({ currency, points }: { currency: FxCurrency; points: readonly Point[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-text-3">The 30-day line shows after two days of rates.</p>
  }
  // Display scaling only: positions on a 240 × 48 drawing.
  const values = points.map((p) => Number.parseFloat(p.rate))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = W / (points.length - 1)
  const coords = values.map(
    (v, i) => `${(i * step).toFixed(1)},${(H - 4 - ((v - min) / span) * (H - 8)).toFixed(1)}`,
  )
  const first = points[0]
  const last = points.at(-1)
  return (
    <figure className="mt-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-12 w-full text-pri"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="sr-only">
        {currency} rate from {first ? dateLabel(first.rateDate) : ''} to{' '}
        {last ? dateLabel(last.rateDate) : ''}: lowest ₦{min}, highest ₦{max}.
      </figcaption>
    </figure>
  )
}
