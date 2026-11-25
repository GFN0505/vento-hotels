// Email checks for sign-up and sign-in forms.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function emailProblem(value: string): string | undefined {
  const email = value.trim()
  if (email === '') return 'Enter your email.'
  if (!EMAIL.test(email)) return 'Enter a valid email, like ada@yourhotel.com.'
  return undefined
}

// Common providers in Nigeria. A domain one or two letters away from one of these is almost
// certainly a typo ("gmial.com"), and the confirmation email would never arrive.
const COMMON_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'aol.com',
]

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] ?? 0
      row[j] = Math.min(
        current + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      previous = current
    }
  }
  return row[b.length] ?? 0
}

// Returns the corrected address when the domain looks like a typo of a common provider.
export function suggestEmail(value: string): string | undefined {
  const email = value.trim().toLowerCase()
  const at = email.lastIndexOf('@')
  if (at < 1) return undefined
  const domain = email.slice(at + 1)
  if (domain === '' || COMMON_DOMAINS.includes(domain)) return undefined
  let best: { domain: string; score: number } | undefined
  for (const candidate of COMMON_DOMAINS) {
    const score = distance(domain, candidate)
    if (score <= 2 && (!best || score < best.score)) best = { domain: candidate, score }
  }
  return best ? `${email.slice(0, at)}@${best.domain}` : undefined
}
