// Staff PINs for shared devices (decision 0022): exactly 4 digits, and not an obvious one.
export const PIN_LENGTH = 4

export function pinProblem(pin: string): string | undefined {
  if (!/^\d{4}$/.test(pin)) return 'Use 4 digits'
  const digits = [...pin].map(Number)
  if (digits.every((d) => d === digits[0])) return 'Too easy to guess. Avoid repeating one digit.'
  const steps = digits.slice(1).map((d, i) => d - (digits[i] ?? 0))
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) {
    return 'Too easy to guess. Avoid runs like 1234.'
  }
  // Patterns people pick: ABAB (1212), the keypad's middle column (2580), and years (1950–2039).
  if (digits[0] === digits[2] && digits[1] === digits[3])
    return 'Too easy to guess. Avoid 1212-style PINs.'
  if (pin === '2580' || pin === '0852') return 'Too easy to guess. Try another.'
  const year = Number(pin)
  if (year >= 1950 && year <= 2039) return 'Too easy to guess. Avoid years.'
  return undefined
}

export function isAcceptablePin(pin: string): boolean {
  return pinProblem(pin) === undefined
}
