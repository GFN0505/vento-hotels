// After go-live, a change that lowers tonight's price asks why in the same dialog (spec: "Rate
// lowered for tonight"), listing each price that would go down. The reason goes on the change and
// into the owner's daily report.
import type { LoweredTonight } from '@vento/shared'
import { ReasonDialog } from '@/components/ui/reason-dialog'
import { errorData } from '@/lib/errors'
import { formatNaira } from './format'

// REASON_REQUIRED's `data.lowered`, read defensively: it comes over the network.
export function loweredFrom(error: unknown): LoweredTonight[] {
  const lowered = errorData(error).lowered
  return Array.isArray(lowered) ? (lowered as LoweredTonight[]) : []
}

type Props = {
  lowered: readonly LoweredTonight[]
  confirmLabel: string
  pending: boolean
  error?: string | undefined
  onConfirm: (reason: string) => void
  onClose: () => void
}

export function LoweredDialog({
  lowered,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: Props) {
  const shown = lowered.slice(0, 6)
  return (
    <ReasonDialog
      open
      title="Lower tonight's price?"
      description="The hotel is live, so a lower price for tonight is recorded."
      label="Reason for lowering tonight's price"
      hint="Recorded with your name. This shows in the owner's daily report."
      confirmLabel={confirmLabel}
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {shown.map((row) => (
          <li
            key={`${row.ratePlanId}-${row.roomTypeId}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2"
          >
            <span className="min-w-0 break-words">
              <span className="font-medium">{row.roomTypeName}</span>
              <span className="text-text-2"> · {row.planName}</span>
            </span>
            <span className="num whitespace-nowrap text-text-2">
              {formatNaira(row.before)} →{' '}
              <span className="font-medium text-text">{formatNaira(row.after)}</span>
            </span>
          </li>
        ))}
        {lowered.length > shown.length ? (
          <li className="px-3 py-2 text-sm text-text-3">
            and {lowered.length - shown.length} more
          </li>
        ) : null}
      </ul>
    </ReasonDialog>
  )
}
