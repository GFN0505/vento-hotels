// The keyboard and filtering behind Combobox (ARIA 1.2 combobox with a listbox popup): type to
// filter, arrows move, Enter chooses, Escape closes without changing anything, and leaving the field
// puts back the chosen label. Enter on a closed list submits the form as usual.
import { type KeyboardEvent, useState } from 'react'

export type ComboOption = {
  value: string
  label: string
  // Options with the same group sit under one heading, in the order given.
  group?: string | undefined
}

// A last row that runs something instead of choosing a value ("Add a company…").
export type ComboAction = { label: string; onSelect: () => void }

export type ComboItem = { kind: 'option'; option: ComboOption } | { kind: 'action'; label: string }

export function filterOptions(options: readonly ComboOption[], query: string): ComboOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...options]
  // "lagos" finds Africa/Lagos; "eti" finds Eti-Osa.
  return options.filter((option) => option.label.toLowerCase().includes(q))
}

type Options = {
  value: string
  options: readonly ComboOption[]
  action?: ComboAction | undefined
  onChange: (value: string) => void
}

export function useCombobox({ value, options, action, onChange }: Options) {
  const [open, setOpen] = useState(false)
  // null while not typing: the field shows the chosen option's label.
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  const selected = options.find((option) => option.value === value)
  const filtered = query === null ? [...options] : filterOptions(options, query)
  const items: ComboItem[] = [
    ...filtered.map((option) => ({ kind: 'option' as const, option })),
    ...(action ? [{ kind: 'action' as const, label: action.label }] : []),
  ]

  function show(list: ComboItem[] = items) {
    setOpen(true)
    const at = list.findIndex((item) => item.kind === 'option' && item.option.value === value)
    setActive(Math.max(at, 0))
  }

  function close() {
    setOpen(false)
    setQuery(null)
    setActive(-1)
  }

  function choose(index: number) {
    const item = items[index]
    if (!item) return
    close()
    if (item.kind === 'action') action?.onSelect()
    else if (item.option.value !== value) onChange(item.option.value)
  }

  function type(text: string) {
    setQuery(text)
    setOpen(true)
    setActive(filterOptions(options, text).length > 0 || action ? 0 : -1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const last = items.length - 1
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return show()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((at) => Math.min(last, Math.max(0, at + step)))
    } else if (open && (event.key === 'Home' || event.key === 'End') && query === null) {
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : last)
    } else if (event.key === 'Enter' && open) {
      // Choosing, not submitting the form.
      event.preventDefault()
      if (active >= 0) choose(active)
    } else if (event.key === 'Escape' && open) {
      // Closes the list only; a second Escape closes the dialog it sits in.
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab' && open) {
      close()
    }
  }

  return {
    open,
    items,
    active,
    text: query ?? selected?.label ?? '',
    setActive,
    show,
    close,
    choose,
    type,
    onKeyDown,
  }
}
