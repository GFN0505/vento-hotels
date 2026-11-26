// Naira as people read it in a field: whole naira with thousands separators ("120,000"), from the
// shared decimal helpers, never a float. Typed amounts are grouped when the person leaves the field;
// the shared schemas accept the commas.
import { dec, formatNaira } from '@vento/shared'

// A stored amount ("120000.00", "-5000.00") as field text: "120,000", "-5,000".
export function nairaField(amount: string | null | undefined): string {
  if (!amount) return ''
  return formatNaira(dec(amount).toFixed(0)).replace('₦', '')
}

// What was typed, grouped once it's a whole number ("150000" → "150,000"); anything else is left
// as typed, for the field's own message to explain.
export function groupTyped(value: string): string {
  const plain = value.trim().replace(/[,\s]/g, '').replace(/^[−–]/, '-').replace(/^\+/, '')
  if (!/^-?\d{1,12}$/.test(plain)) return value
  return nairaField(plain)
}
