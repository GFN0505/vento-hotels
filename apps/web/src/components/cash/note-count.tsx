// Counting naira by note (design #34, Cash view open and ShiftClose step 1): one row per note with
// its count and total, then smaller notes and coins as one amount, and the total. Tab moves down the
// rows; each row's total updates as she types. Read-only on the submitted step.
import {
  type NoteCount as Count,
  countTotal,
  NGN_NOTES,
  type NgnNote,
  noteTotal,
} from '@vento/shared'
import { type ReactNode, useId } from 'react'
import { cn } from '@/lib/cn'
import { type CountDraft, coinsProblem, draftTotal, noteProblem, rowTotal } from './count-model'
import { naira } from './format'

type Props = {
  title: string
  hint: string
  totalLabel: string
  // Editable: the draft and its setter. Read-only: the stored count.
  draft?: CountDraft
  onChange?: (draft: CountDraft) => void
  count?: Count
  disabled?: boolean
  // From the last submit, by field.
  problems?: Partial<Record<keyof CountDraft, string>>
  // Field ids start with this, so a submit can focus the first problem.
  idPrefix?: string
  footer?: ReactNode
}

const noteLabel = (note: NgnNote) => `₦${Number(note).toLocaleString('en-NG')}`

export function NoteCount({
  title,
  hint,
  totalLabel,
  draft,
  onChange,
  count,
  disabled,
  problems = {},
  idPrefix,
  footer,
}: Props) {
  const generated = useId()
  const prefix = idPrefix ?? generated
  const headingId = `${prefix}-heading`
  const total = draft ? draftTotal(draft) : count ? countTotal(count) : '0.00'
  const set = (key: keyof CountDraft, value: string) => {
    if (draft && onChange) onChange({ ...draft, [key]: value })
  }
  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-md border border-border bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id={headingId} className="font-semibold">
          {title}
        </h2>
        <span className="text-sm text-text-3">{hint}</span>
      </div>
      <ul className="divide-y divide-border">
        {NGN_NOTES.map((note) => {
          const id = `${prefix}-${note}`
          const value = draft?.[note] ?? String(count?.[note] ?? 0)
          const problem = draft ? (problems[note] ?? noteProblem(draft[note])) : undefined
          return (
            <li key={note} className="flex flex-col px-4 py-2">
              <div className="flex items-center gap-3">
                {draft ? (
                  <label htmlFor={id} className="num w-16 flex-none font-medium">
                    {noteLabel(note)}
                  </label>
                ) : (
                  <span className="num w-16 flex-none font-medium">{noteLabel(note)}</span>
                )}
                <span aria-hidden="true" className="text-text-3">
                  ×
                </span>
                {draft ? (
                  <input
                    id={id}
                    name={`notes-${note}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={value}
                    disabled={disabled}
                    placeholder="0"
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? `${id}-problem` : undefined}
                    aria-label={`Notes of ${noteLabel(note)}`}
                    onChange={(event) => set(note, event.target.value)}
                    className={cn(
                      'num h-11 w-24 rounded-sm border border-input bg-surface px-2 text-center text-[16px] lg:h-8 lg:text-base',
                      'focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none',
                      'aria-invalid:border-ro-dot aria-invalid:ring-3 aria-invalid:ring-ro-bg disabled:bg-surface-2',
                    )}
                  />
                ) : (
                  <span id={id} className="num w-24 text-center">
                    {value}
                  </span>
                )}
                <span className="grow" />
                <span className="num text-right">
                  {naira(draft ? rowTotal(note, draft[note]) : noteTotal(note, count?.[note] ?? 0))}
                </span>
              </div>
              {problem ? (
                <span id={`${id}-problem`} className="mt-1 text-sm text-ro">
                  {problem}
                </span>
              ) : null}
            </li>
          )
        })}
        <li className="flex flex-col px-4 py-2">
          <div className="flex items-center gap-3">
            {draft ? (
              <label htmlFor={`${prefix}-coins`} className="min-w-0 grow text-sm font-medium">
                Smaller notes and coins
              </label>
            ) : (
              <span className="min-w-0 grow text-sm font-medium">Smaller notes and coins</span>
            )}
            {draft ? (
              <span className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-text-3"
                >
                  ₦
                </span>
                <input
                  id={`${prefix}-coins`}
                  name="coins"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft.coins}
                  disabled={disabled}
                  placeholder="0.00"
                  aria-invalid={problems.coins || coinsProblem(draft.coins) ? true : undefined}
                  aria-describedby={
                    problems.coins || coinsProblem(draft.coins)
                      ? `${prefix}-coins-problem`
                      : undefined
                  }
                  onChange={(event) => set('coins', event.target.value)}
                  className={cn(
                    'num h-11 w-32 rounded-sm border border-input bg-surface pr-2 pl-7 text-right text-[16px] lg:h-8 lg:text-base',
                    'focus:border-ring focus:ring-3 focus:ring-pri-line focus-visible:outline-none',
                    'aria-invalid:border-ro-dot aria-invalid:ring-3 aria-invalid:ring-ro-bg disabled:bg-surface-2',
                  )}
                />
              </span>
            ) : (
              <span id={`${prefix}-coins`} className="num">
                {naira(count?.coins ?? '0.00')}
              </span>
            )}
          </div>
          {draft && (problems.coins || coinsProblem(draft.coins)) ? (
            <span id={`${prefix}-coins-problem`} className="mt-1 text-sm text-ro">
              {problems.coins ?? coinsProblem(draft.coins)}
            </span>
          ) : null}
        </li>
      </ul>
      <div
        className="num flex items-center justify-between border-t border-border bg-surface-2 px-4 py-2.5 font-semibold"
        aria-live="polite"
      >
        <span>{totalLabel}</span>
        <span>{naira(total)}</span>
      </div>
      {footer}
    </section>
  )
}
