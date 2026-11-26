// Where to go after signing in: only a path inside Vento, never another site (no open redirects).
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return undefined
  // Backslashes and control characters can turn a path into another site in some browsers.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what we refuse
  if (/[\\\u0000-\u001f]/.test(value) || /^\/%2f/i.test(value)) return undefined
  return value.slice(0, 500)
}
