// Postgres error codes we turn into clear messages. Drizzle wraps the driver error in `cause`.
function pgCode(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown })?.cause]
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown })?.code
    if (typeof code === 'string') return code
  }
  return undefined
}

export function isUniqueViolation(error: unknown): boolean {
  return pgCode(error) === '23505'
}

export function isForeignKeyViolation(error: unknown): boolean {
  return pgCode(error) === '23503'
}

// The name of the constraint a write broke, so one unique violation can be told from another.
export function violatedConstraint(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown })?.cause]
  for (const candidate of candidates) {
    const name = (candidate as { constraint?: unknown })?.constraint
    if (typeof name === 'string') return name
  }
  return undefined
}

// An exclusion constraint (two stays in one room on a night; overlapping out-of-order periods).
export function isExclusionViolation(error: unknown): boolean {
  return pgCode(error) === '23P01'
}
