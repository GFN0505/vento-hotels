// Under the toolbar once the whole page is ticked: offer every room in the view, then say plainly
// what's selected (and when the bulk limit capped it).
import { MAX_ROOMS_PER_BATCH } from '@vento/shared'
import { Button } from '@/components/ui/button'
import { plural } from './format'

type Props = {
  pageCount: number
  total: number
  selected: number
  viewTotal: number | undefined
  loading: boolean
  onSelectView: () => void
  onClear: () => void
}

export function SelectAllBanner(props: Props) {
  const { pageCount, total, selected, viewTotal, loading } = props
  const all = viewTotal !== undefined
  if (!all && (selected < pageCount || total <= pageCount)) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-border bg-surface-2/60 px-4 py-2 text-center text-sm">
      <p aria-live="polite" className="text-text-2">
        {all
          ? viewTotal > MAX_ROOMS_PER_BATCH
            ? `The first ${MAX_ROOMS_PER_BATCH} of ${plural(viewTotal, 'room')} in this view are selected. Changes go ${MAX_ROOMS_PER_BATCH} at a time.`
            : `All ${plural(viewTotal, 'room')} in this view are selected.`
          : `All ${plural(pageCount, 'room')} on this page are selected.`}
      </p>
      {all ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-pri-ink max-lg:h-11"
          onClick={props.onClear}
        >
          Clear selection
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-pri-ink max-lg:h-11"
          loading={loading}
          onClick={props.onSelectView}
        >
          Select all {plural(total, 'room')} in this view
        </Button>
      )}
    </div>
  )
}
