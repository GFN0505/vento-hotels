// Pieces the Modify, Cancel and Mark no-show dialogs share: the policy box, the waive checkbox with
// its reason, reason pills, the hotel-switch guard and the footer line.
import { type ReactNode, useCallback, useState } from 'react'
import { useLeaveGuard } from '@/components/shell/property-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/cn'

export const AUDIT_LINE = 'Saved to the audit trail with your name and device.'

// The inset box of figures (design: `.inset`): label on the left, figure on the right, the last row
// strong under a rule.
export function FigureBox({
  rows,
  children,
}: {
  rows: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: 'muted' }[]
  children?: ReactNode
}) {
  return (
    <div className="num flex flex-col gap-1.5 rounded-sm border border-border bg-surface p-3">
      <dl className="flex flex-col gap-1.5">
        {rows.map((row, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are fixed per render
            key={index}
            className={cn(
              'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5',
              row.strong && 'font-semibold',
              row.strong && index > 0 && 'border-t border-border pt-1.5',
            )}
          >
            <dt className={cn('min-w-0 break-words', !row.strong && 'text-text-2')}>{row.label}</dt>
            <dd className="text-right break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  )
}

export function Pills<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: {
  legend: string
  name: string
  options: readonly { value: T; label: string }[]
  value: T | undefined
  onChange: (value: T) => void
  error?: string | undefined
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-text-2">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'relative inline-flex h-11 cursor-pointer items-center rounded-full border border-border-strong px-3 text-sm lg:h-8',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
              value === option.value && 'border-pri-line bg-pri-soft font-medium text-pri-ink',
            )}
          >
            <input
              type="radio"
              name={name}
              className="absolute inset-0 cursor-pointer opacity-0"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-ro">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  error,
  maxLength = 500,
  id,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | undefined
  maxLength?: number
  id: string
}) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={id}>
      <span className="text-sm font-medium text-text-2">{label}</span>
      <textarea
        id={id}
        value={value}
        rows={2}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-problem` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-sm border border-input bg-surface px-3 py-2 text-[16px] focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none aria-invalid:border-ro-dot lg:text-base"
      />
      {error ? (
        <span id={`${id}-problem`} role="alert" className="text-sm text-ro">
          {error}
        </span>
      ) : null}
    </label>
  )
}

// "Waive the penalty": the whole amount, with a required reason; without the permission it goes to
// a manager ("Waiving needs a manager. Tunde, Sade or Adaeze can approve it.").
export function WaiveField({
  checked,
  onChecked,
  reason,
  onReason,
  error,
  note,
}: {
  checked: boolean
  onChecked: (value: boolean) => void
  reason: string
  onReason: (value: string) => void
  error?: string | undefined
  note: string | null
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="waive-penalty"
        className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start lg:min-h-0"
      >
        <Checkbox
          id="waive-penalty"
          checked={checked}
          onChange={(event) => onChecked(event.target.checked)}
        />
        <span>Waive the penalty</span>
      </label>
      {checked ? (
        <>
          <TextArea
            id="waive-reason"
            label="Reason for waiving"
            value={reason}
            onChange={onReason}
            error={error}
          />
          {note ? <p className="text-sm text-text-2">{note}</p> : null}
        </>
      ) : null}
    </div>
  )
}

// A dialog open over a hotel page: changing the hotel asks first ("Discard this change?"), and the
// bar replaces the dialog's buttons until answered.
export function useDialogLeaveGuard(onDiscard: () => void, extra?: string) {
  const [leaving, setLeaving] = useState<(() => void) | null>(null)
  useLeaveGuard(useCallback((proceed: () => void) => setLeaving(() => proceed), []))
  const bar = leaving ? (
    <div className="flex w-full flex-wrap items-center gap-2" role="alert">
      <p className="grow font-medium">
        Discard this change?
        {extra ? <span className="font-normal text-text-2"> {extra}</span> : null}
      </p>
      <Button onClick={() => setLeaving(null)} data-autofocus>
        Keep editing
      </Button>
      <Button
        variant="danger"
        onClick={() => {
          const proceed = leaving
          setLeaving(null)
          onDiscard()
          proceed()
        }}
      >
        Discard
      </Button>
    </div>
  ) : null
  return bar
}
