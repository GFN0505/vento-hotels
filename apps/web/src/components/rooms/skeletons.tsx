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

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <span className="h-7 w-32 animate-pulse rounded-sm bg-surface-2" />
        <span className="h-4 w-64 animate-pulse rounded-sm bg-surface-2" />
      </div>
      <div className="rounded-md border border-border bg-surface shadow-card">
        <TableSkeleton rows={4} label="Loading room types" />
      </div>
      <div className="rounded-md border border-border bg-surface shadow-card">
        <TableSkeleton rows={8} label="Loading rooms" />
      </div>
    </div>
  )
}
