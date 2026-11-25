// Checks a new password and its confirmation before anything is sent. The rule itself lives in
// @vento/shared, so these screens and the API always agree.
import { isStrongPassword } from '@vento/shared'

export type PasswordErrors = { password?: string; confirm?: string }

export function checkNewPassword(password: string, confirm: string): PasswordErrors {
  const errors: PasswordErrors = {}
  if (!isStrongPassword(password))
    errors.password = "Your password doesn't meet every rule below yet."
  if (confirm.length === 0) errors.confirm = 'Enter your password again.'
  else if (confirm !== password) errors.confirm = "Passwords don't match. Type it again."
  return errors
}
