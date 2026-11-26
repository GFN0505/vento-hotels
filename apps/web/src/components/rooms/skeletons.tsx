// Loading shapes that match the final layout (UX standard: no layout shift).
export function TableSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: rows }, (_, i) => `row-${i}`).map((key) => (
        <div
          key={key}
          className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0"
        >
          <span className="h-2.5 w-10 animate-pulse rounded-full bg-surface-3" />
          <span className="h-2.5 flex-[2] animate-pulse rounded-full bg-surface-3" />
          <span className="h-2.5 flex-1 animate-pulse rounded-full bg-surface-3" />
          <span className="h-2.5 flex-1 animate-pulse rounded-full bg-surface-3 max-sm:hidden" />
          <span className="h-2.5 flex-1 animate-pulse rounded-full bg-surface-3 max-sm:hidden" />
        </div>
      ))}
    </div>
  )
}

const bar = 'animate-pulse rounded-sm bg-surface-2'

function HeaderSkeleton({ actions }: { actions: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-2">
        <span className={`h-7 w-40 ${bar}`} />
        <span className={`h-4 w-64 ${bar}`} />
      </div>
      {actions ? (
        <div className="flex gap-2">
          <span className={`h-11 w-40 ${bar} max-sm:hidden lg:h-10`} />
          <span className={`h-11 w-36 ${bar} lg:h-10`} />
        </div>
      ) : null}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      {/* A title for focus and screen readers to land on while the page loads. */}
      <h1 tabIndex={-1} className="sr-only">
        Rooms
      </h1>
      <HeaderSkeleton actions />
      <div className="rounded-md border border-border bg-surface shadow-card">
        <TableSkeleton rows={4} label="Loading room types" />
      </div>
      <div className="rounded-md border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <span className={`h-11 w-52 ${bar} lg:h-8`} />
          {['w-16', 'w-24', 'w-28', 'w-20'].map((w) => (
            <span key={w} className={`h-11 ${w} rounded-full bg-surface-2 lg:h-7`} />
          ))}
        </div>
        <TableSkeleton rows={8} label="Loading rooms" />
      </div>
    </div>
  )
}

// A new hotel opens on the builder, so it loads in the builder's shape.
export function BuilderSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" role="status" aria-label="Loading">
      <HeaderSkeleton actions={false} />
      {[2, 2, 5].map((rows, i) => (
        <div
          key={['types', 'lines', 'preview'][i]}
          className="rounded-md border border-border bg-surface shadow-card"
        >
          <div className="border-b border-border px-5 py-3.5">
            <span className={`block h-4 w-28 ${bar}`} />
          </div>
          <div className="flex flex-col gap-3 px-5 py-4">
            {Array.from({ length: rows }, (_, r) => `r${r}`).map((key) => (
              <span key={key} className={`h-9 ${bar}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
