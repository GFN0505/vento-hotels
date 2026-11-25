// Checks a new password and its confirmation before anything is sent. The API enforces the same
// minimum length (decision 0017); this only gives a quicker, clearer message.
export const MIN_PASSWORD_LENGTH = 10

export type PasswordErrors = { password?: string; confirm?: string }

export function checkNewPassword(password: string, confirm: string): PasswordErrors {
  const errors: PasswordErrors = {}
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (confirm.length === 0) errors.confirm = 'Enter your password again.'
  else if (confirm !== password) errors.confirm = "Passwords don't match."
  return errors
}
