// A labelled field with a filterable list (design system: Combobox), for choices too long for a
// row of buttons: state, LGA, owning company, time zone. Type to narrow the list; arrows, Enter
// and Escape work as in any picker, and screen readers hear each option as it's highlighted.
// Built on a plain input and an ARIA listbox, so nothing extra to download.
import { ChevronDown } from 'lucide-react'
import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { type ComboAction, type ComboItem, type ComboOption, useCombobox } from './use-combobox'

export type { ComboAction, ComboOption }

const POPUP =
  'absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-[var(--shadow-lg)]'

// Options under their group headings, keeping each one's place in the whole list.
function sections(items: readonly ComboItem[]) {
  const out: {
    key: string
    group: string | undefined
    rows: { item: ComboItem; index: number }[]
  }[] = []
  items.forEach((item, index) => {
    const group = item.kind === 'option' ? item.option.group : undefined
    const last = out.at(-1)
    if (last && last.group === group) last.rows.push({ item, index })
    else out.push({ key: `s${out.length}`, group, rows: [{ item, index }] })
  })
  return out
}

type Props = {
  label: string
  name?: string
  value: string
  options: readonly ComboOption[]
  onChange: (value: string) => void
  action?: ComboAction | undefined
  placeholder?: string | undefined
  hint?: ReactNode
  error?: string | undefined
  disabled?: boolean | undefined
  readOnly?: boolean | undefined
  className?: string | undefined
}

export function Combobox(props: Props) {
  const { label, name, value, options, onChange, action, placeholder, hint, error } = props
  const { disabled, readOnly, className } = props
  const id = useId()
  const listId = `${id}-list`
  const messageId = `${id}-message`
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const box = useCombobox({ value, options, action, onChange })
  const [changedSinceError, setChangedSinceError] = useState(false)
  useEffect(() => {
    if (error) setChangedSinceError(false)
  }, [error])
  const shown = error && !changedSinceError ? error : undefined
  const message = shown ?? hint
  const locked = disabled || readOnly
  const optionId = (index: number) => `${id}-option-${index}`

  // The highlighted option stays in view as the arrows move through a long list.
  useEffect(() => {
    if (box.open && box.active >= 0) {
      list.current?.querySelector(`#${CSS.escape(optionId(box.active))}`)?.scrollIntoView({
        block: 'nearest',
      })
    }
  })

  function renderRow({ item, index }: { item: ComboItem; index: number }) {
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: the field handles the keys (aria-activedescendant).
      <div
        key={item.kind === 'option' ? item.option.value : 'action'}
        id={optionId(index)}
        role="option"
        // Highlighted through aria-activedescendant; focus stays in the field.
        tabIndex={-1}
        aria-selected={item.kind === 'option' && item.option.value === value}
        // Keeps focus in the field, so the list doesn't close before the click lands.
        onMouseDown={(event) => event.preventDefault()}
        onMouseMove={() => box.setActive(index)}
        onClick={() => box.choose(index)}
        className={cn(
          'flex min-h-11 cursor-pointer items-center rounded-sm px-2.5 text-text lg:min-h-8',
          'aria-selected:font-medium aria-selected:text-pri-ink',
          index === box.active && 'bg-surface-2',
          item.kind === 'action' && 'mt-1 border-t border-border font-medium text-pri-ink',
        )}
      >
        {item.kind === 'option' ? item.option.label : item.label}
      </div>
    )
  }

  return (
    <div className="relative flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-2">
        {label}
      </label>
      <div className="relative">
        <input
          ref={input}
          id={id}
          name={name}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={box.open}
          aria-controls={listId}
          aria-activedescendant={box.open && box.active >= 0 ? optionId(box.active) : undefined}
          aria-invalid={shown ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          autoComplete="off"
          spellCheck={false}
          value={box.text}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          onChange={(event) => {
            setChangedSinceError(true)
            box.type(event.target.value)
          }}
          onClick={() => (locked ? undefined : box.open ? box.close() : box.show())}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={box.close}
          onKeyDown={(event) => (locked ? undefined : box.onKeyDown(event))}
          className={cn(
            'h-11 w-full rounded-sm border border-input bg-surface pr-9 pl-2.5 text-[16px] text-text placeholder:text-text-3 lg:h-9 lg:text-base',
            'focus:border-ring focus-visible:outline-none focus:ring-3 focus:ring-pri-line',
            'aria-invalid:border-ro-dot aria-invalid:ring-3 aria-invalid:ring-ro-bg',
            'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-2',
            'read-only:cursor-default read-only:bg-surface-2 read-only:text-text-2',
            className,
          )}
        />
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-text-3 transition-transform',
            box.open && 'rotate-180',
            locked && 'opacity-50',
          )}
        />
      </div>
      <div
        ref={list}
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!box.open || box.items.length === 0}
        className={POPUP}
      >
        {sections(box.items).map((section) =>
          section.group ? (
            // A listbox's groups are ARIA groups; a fieldset would break the listbox's structure.
            // biome-ignore lint/a11y/useSemanticElements: see above.
            <div key={section.group} role="group" aria-labelledby={`${id}-${section.key}`}>
              <div
                id={`${id}-${section.key}`}
                className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-[0.05em] text-text-3 uppercase"
              >
                {section.group}
              </div>
              {section.rows.map(renderRow)}
            </div>
          ) : (
            <Fragment key={section.key}>{section.rows.map(renderRow)}</Fragment>
          ),
        )}
      </div>
      {box.open && box.items.length === 0 ? (
        <p role="status" className={cn(POPUP, 'px-3.5 py-2.5 text-text-2')}>
          No matches. Check the spelling.
        </p>
      ) : null}
      {shown ? (
        <span id={messageId} className="text-sm text-ro" aria-live="polite">
          {shown}
        </span>
      ) : hint ? (
        <span id={messageId} className="text-sm text-text-3">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
