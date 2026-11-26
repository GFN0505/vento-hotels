// Shown while rooms are ticked: what's selected and what can be done to all of them at once. It
// floats at the bottom of the screen so it's in reach on long lists and on phones.
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { plural } from './format'

type Props = {
  count: number
  archived: boolean
  pending: boolean
  onChangeType: () => void
  onRemove: () => void
  onRestore: () => void
  onClear: () => void
}

export function BulkBar({
  count,
  archived,
  pending,
  onChangeType,
  onRemove,
  onRestore,
  onClear,
}: Props) {
  return (
    <div className="pointer-events-none sticky bottom-4 z-10 flex justify-center px-4 pb-4">
      <section
        aria-label="Selected rooms"
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border-strong bg-surface py-2 pr-2 pl-4 shadow-[var(--shadow-lg)]"
      >
        <p className="num mr-2 font-semibold" aria-live="polite">
          {plural(count, 'room')} selected
        </p>
        {archived ? (
          <Button variant="primary" className="max-lg:h-11" loading={pending} onClick={onRestore}>
            Restore
          </Button>
        ) : (
          <>
            <Button className="max-lg:h-11" disabled={pending} onClick={onChangeType}>
              Change type
            </Button>
            <Button variant="danger" className="max-lg:h-11" loading={pending} onClick={onRemove}>
              Remove
            </Button>
          </>
        )}
        <Button size="icon" variant="ghost" aria-label="Clear selection" onClick={onClear}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </section>
    </div>
  )
}
