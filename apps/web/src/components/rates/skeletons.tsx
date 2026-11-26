// Loading shapes for the rates pages that match what arrives (UX standard: no layout shift).
import { TableSkeleton } from '@/components/rooms/skeletons'

const bar = 'animate-pulse rounded-sm bg-surface-2'

export function RatesSkeleton({
  title,
  calendar,
}: {
  title: string
  calendar?: boolean | undefined
}) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      {/* A title for focus and screen readers to land on while the page loads. */}
      <h1 tabIndex={-1} className="sr-only">
        {title}
      </h1>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className={`h-4 w-32 ${bar}`} />
          <span className={`h-7 w-40 ${bar}`} />
          <span className={`h-4 w-72 max-w-full ${bar}`} />
        </div>
        <span className={`h-11 w-36 ${bar} lg:h-10`} />
      </div>
      {calendar ? (
        <div className="flex flex-wrap gap-2">
          {['w-28 a', 'w-11 b', 'w-11 c', 'w-36 d', 'w-32 e'].map((w) => (
            <span key={w} className={`h-11 ${w.split(' ')[0]} ${bar} lg:h-8`} />
          ))}
        </div>
      ) : null}
      <div className="rounded-md border border-border bg-surface shadow-card">
        <TableSkeleton rows={calendar ? 10 : 5} label={`Loading ${title.toLowerCase()}`} />
      </div>
    </div>
  )
}

export function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <h1 tabIndex={-1} className="sr-only">
        Rate plan
      </h1>
      <div className="flex flex-col gap-2">
        <span className={`h-4 w-32 ${bar}`} />
        <span className={`h-7 w-64 max-w-full ${bar}`} />
        <span className={`h-4 w-48 ${bar}`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          {[4, 3, 4].map((rows, i) => (
            <div
              key={['price', 'types', 'terms'][i]}
              className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5 shadow-card"
            >
              <span className={`h-4 w-28 ${bar}`} />
              {Array.from({ length: rows }, (_, r) => `r${r}`).map((key) => (
                <span key={key} className={`h-9 ${bar}`} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5 shadow-card max-lg:hidden">
          <span className={`h-4 w-36 ${bar}`} />
          {['a', 'b', 'c', 'd'].map((key) => (
            <span key={key} className={`h-6 ${bar}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
