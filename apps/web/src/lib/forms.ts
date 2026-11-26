// After a failed submit, move focus to the first field with a problem (in screen order), so the
// person and their screen reader land straight on what needs fixing.
export function focusFirstProblem(
  form: HTMLFormElement,
  order: readonly string[],
  errors: Partial<Record<string, string | undefined>>,
): void {
  const first = order.find((name) => errors[name])
  if (!first) return
  const element = form.elements.namedItem(first)
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) element.focus()
}
