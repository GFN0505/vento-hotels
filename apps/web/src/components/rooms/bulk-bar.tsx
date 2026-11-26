// Shown while rooms are ticked: how many and what can be done to all of them at once. On wider
// screens it takes the toolbar's place at the top of the list; on phones it floats, one line, at
// the bottom of the screen within thumb reach.
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

type Props = {
  count: number
  archived: boolean
  pending: boolean
  inline?: boolean
  className?: string
  onChangeType: () => void
  onRemove: () => void
  onRestore: () => void
  onClear: () => void
}

export function BulkBar(props: Props) {
  const { count, archived, pending, inline, className } = props
  const bar = (
    <section
      aria-label="Selected rooms"
      className={cn(
        'flex items-center gap-2',
        inline
          ? 'min-h-[57px] border-b border-border bg-pri-soft/60 px-4 py-2.5 sm:px-5'
          : 'pointer-events-auto max-w-full flex-nowrap rounded-lg border border-border-strong bg-surface py-1.5 pr-1.5 pl-3.5 shadow-[var(--shadow-lg)]',
      )}
    >
      <p className="num mr-auto font-semibold whitespace-nowrap" aria-live="polite">
        {count} selected
      </p>
      {archived ? (
        <Button
          variant="primary"
          className="max-lg:h-11"
          loading={pending}
          onClick={props.onRestore}
        >
          Restore
        </Button>
      ) : (
        <>
          <Button className="max-lg:h-11" disabled={pending} onClick={props.onChangeType}>
            Change type
          </Button>
          <Button
            variant="danger"
            className="max-lg:h-11"
            loading={pending}
            onClick={props.onRemove}
          >
            Remove
          </Button>
        </>
      )}
      <Button size="icon" variant="ghost" aria-label="Clear selection" onClick={props.onClear}>
        <X className="size-4" aria-hidden="true" />
      </Button>
    </section>
  )
  if (inline) return bar
  return (
    <div
      className={cn(
        'pointer-events-none sticky bottom-3 z-20 flex justify-center px-3 pb-3',
        className,
      )}
    >
      {bar}
    </div>
  )
}
