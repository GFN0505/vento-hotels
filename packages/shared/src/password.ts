// The password rule (owner's decision): at least 8 characters with a capital letter, a small letter,
// a number and a special character. Defined once here so the screens and the API always agree.
export const MIN_PASSWORD_LENGTH = 8

export type PasswordRuleId = 'length' | 'upper' | 'lower' | 'digit' | 'special'

export const PASSWORD_RULES: readonly {
  id: PasswordRuleId
  label: string
  test: (p: string) => boolean
}[] = [
  {
    id: 'length',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (p) => [...p].length >= MIN_PASSWORD_LENGTH,
  },
  { id: 'upper', label: 'A capital letter', test: (p) => /\p{Lu}/u.test(p) },
  { id: 'lower', label: 'A small letter', test: (p) => /\p{Ll}/u.test(p) },
  { id: 'digit', label: 'A number', test: (p) => /\p{Nd}/u.test(p) },
  // Anything that isn't a letter, number or space counts: ! @ # $ % & * ? - _ . and so on.
  {
    id: 'special',
    label: 'A special character (!@#?)',
    test: (p) => /[^\p{L}\p{Nd}\s]/u.test(p),
  },
]

// The rules a password doesn't meet yet, in display order. Empty means it's acceptable.
export function unmetPasswordRules(password: string): PasswordRuleId[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.id)
}

export function isStrongPassword(password: string): boolean {
  return unmetPasswordRules(password).length === 0
}

export const PASSWORD_RULE_SUMMARY = `Use at least ${MIN_PASSWORD_LENGTH} characters, with a capital letter, a small letter, a number and a special character.`
