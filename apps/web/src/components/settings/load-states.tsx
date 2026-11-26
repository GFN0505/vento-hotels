// Loading and load-error states for settings pages (design #25: SetLoading, SetError). Skeletons
// take the final layout's shape, so nothing jumps when the data arrives.
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

const bar = 'animate-pulse rounded-sm bg-surface-2'

export function HeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-2">
        <span className={`h-7 w-44 ${bar}`} />
        <span className={`h-4 w-64 ${bar}`} />
      </div>
      <span className={`h-11 w-36 ${bar} lg:h-10`} />
    </div>
  )
}

export function RowsSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => `row-${i}`).map((key) => (
        <div
          key={key}
          className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0"
        >
          <span className="size-9 flex-none animate-pulse rounded-lg bg-surface-3" />
          <span className="h-2.5 flex-[2] animate-pulse rounded-full bg-surface-3" />
          <span className="h-2.5 flex-1 animate-pulse rounded-full bg-surface-3" />
          <span className="h-2.5 flex-1 animate-pulse rounded-full bg-surface-3 max-sm:hidden" />
          <span className="h-2.5 flex-1 animate-pulse rounded-full bg-surface-3 max-sm:hidden" />
        </div>
      ))}
    </div>
  )
}

// The hotel settings page: three cards of fields and the business date panel.
export function FormSkeleton() {
  return (
    <div
      className="flex flex-col gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading settings"
    >
      <HeaderSkeleton />
      {[3, 2, 3].map((fields, i) => (
        <div
          key={['identity', 'address', 'time'][i]}
          className="rounded-md border border-border bg-surface shadow-card"
        >
          <div className="border-b border-border px-4 py-3.5">
            <span className={`block h-4 w-32 ${bar}`} />
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {Array.from({ length: fields }, (_, f) => `f${f}`).map((key) => (
              <div key={key} className="flex flex-col gap-2">
                <span className={`h-3 w-20 ${bar}`} />
                <span className={`h-11 ${bar} lg:h-9`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function LoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-card"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-ro-bg text-ro ring-1 ring-border">
        <AlertTriangle className="size-5" aria-hidden="true" strokeWidth={1.8} />
      </span>
      <p className="text-[15px] font-semibold">Couldn't load settings</p>
      <p className="max-w-sm text-text-2">
        Nothing was changed. Your last saved settings are still in force.
      </p>
      <Button onClick={onRetry} loading={retrying} className="max-lg:h-11">
        Try again
      </Button>
    </div>
  )
}
