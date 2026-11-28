// Takings by method (design #34 ShiftClose, submitted): expected, counted and the difference per
// line, once the count is in. A difference reads "−₦2,500.00 short" or "+₦12,500.00 over" in
// words as well as colour; ₦0.00 is muted.
import { type CountLineView, cashAmount, dec } from '@vento/shared'
import { useId } from 'react'
import { cn } from '@/lib/cn'
import { naira, signedAmount, sourceOf } from './format'

const own = (line: CountLineView, amount: string) =>
  cashAmount(amount, line.kind === 'cash' ? line.currency : 'NGN')

export function TakingsTable({
  lines,
  openingFloat,
}: {
  lines: readonly CountLineView[]
  openingFloat: string
}) {
  const headingId = useId()
  const name = (line: CountLineView) =>
    line.kind === 'cash' && line.currency === 'NGN'
      ? `Cash ₦ (incl. ${naira(openingFloat)} float)`
      : line.label
  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-md border border-border bg-surface shadow-card"
    >
      <h2 id={headingId} className="border-b border-border px-4 py-3 font-semibold">
        Takings by method
      </h2>
      {/* Phones: one card per line. */}
      <ul className="divide-y divide-border xl:hidden">
        {lines.map((line) => (
          <li
            key={`${line.kind}-${line.currency}-${line.posTerminalId}`}
            className="flex flex-col gap-1 px-4 py-3"
          >
            <span className="font-medium">{name(line)}</span>
            <dl className="num grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-text-3">Expected</dt>
                <dd>{own(line, line.expected)}</dd>
              </div>
              <div>
                <dt className="text-text-3">Counted</dt>
                <dd>{own(line, line.counted)}</dd>
              </div>
              <div>
                <dt className="text-text-3">Difference</dt>
                <dd>
                  <Difference line={line} />
                </dd>
              </div>
            </dl>
            <span className="text-sm text-text-3">{sourceOf(line)}</span>
          </li>
        ))}
      </ul>
      <div className="max-xl:hidden">
        <table className="w-full text-left">
          <thead className="text-sm text-text-2">
            <tr className="border-b border-border">
              <th scope="col" className="px-4 py-2 font-medium">
                Method
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Expected
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Counted
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium whitespace-nowrap">
                Difference
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((line) => (
              <tr key={`${line.kind}-${line.currency}-${line.posTerminalId}`}>
                <th scope="row" className="px-4 py-2.5 font-medium">
                  <span className="block">{name(line)}</span>
                  <span className="block text-sm font-normal text-text-3">{sourceOf(line)}</span>
                </th>
                <td className="num px-4 py-2.5 text-right whitespace-nowrap">
                  {own(line, line.expected)}
                </td>
                <td className="num px-4 py-2.5 text-right whitespace-nowrap">
                  {own(line, line.counted)}
                </td>
                <td className="num px-4 py-2.5 text-right whitespace-nowrap">
                  <Difference line={line} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Difference({ line }: { line: CountLineView }) {
  const value = dec(line.difference)
  const currency = line.kind === 'cash' ? line.currency : 'NGN'
  if (value.isZero()) return <span className="text-text-3">{signedAmount('0', currency)}</span>
  return (
    <span className={cn('font-medium text-ro')}>
      {signedAmount(line.difference, currency)} {value.isNegative() ? 'short' : 'over'}
    </span>
  )
}
